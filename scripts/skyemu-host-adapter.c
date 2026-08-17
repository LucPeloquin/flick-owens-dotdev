/*
 * Small, owned libretro host for SkyEmu v5.
 *
 * SkyEmu remains an unmodified pinned upstream dependency. This file only
 * adapts its libretro callbacks to a stable worker-facing C ABI, so the React
 * runtime never relies on private emulator internals. Build it with the exact
 * SkyEmu v5 source checkout using scripts/build-skyemu-adapter.mjs.
 */

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include "libretro.h"

#if defined(__EMSCRIPTEN__)
#include <emscripten/emscripten.h>
#define SKYEMU_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define SKYEMU_EXPORT
#endif

enum skyemu_control {
  SKYEMU_A = 0,
  SKYEMU_B,
  SKYEMU_X,
  SKYEMU_Y,
  SKYEMU_L,
  SKYEMU_R,
  SKYEMU_UP,
  SKYEMU_DOWN,
  SKYEMU_LEFT,
  SKYEMU_RIGHT,
  SKYEMU_SELECT,
  SKYEMU_START,
};

static void skyemu_log(enum retro_log_level level, const char *format, ...) {
  (void)level;
  (void)format;
}

static uint32_t buttons;
static int16_t touch_x;
static int16_t touch_y;
static bool touch_pressed;

static uint8_t *frame_buffer;
static size_t frame_capacity;
static uint32_t frame_width;
static uint32_t frame_height;
static size_t frame_bytes;

static int16_t *audio_buffer;
static size_t audio_capacity;
static size_t audio_frames;

static void ensure_frame_capacity(size_t bytes) {
  if (bytes <= frame_capacity) return;
  uint8_t *next = (uint8_t *)realloc(frame_buffer, bytes);
  if (!next) return;
  frame_buffer = next;
  frame_capacity = bytes;
}

static void ensure_audio_capacity(size_t samples) {
  if (samples <= audio_capacity) return;
  int16_t *next = (int16_t *)realloc(audio_buffer, samples * sizeof(int16_t));
  if (!next) return;
  audio_buffer = next;
  audio_capacity = samples;
}

static bool skyemu_environment(unsigned command, void *data) {
  switch (command) {
    case RETRO_ENVIRONMENT_GET_LOG_INTERFACE:
      if (data) ((struct retro_log_callback *)data)->log = skyemu_log;
      return true;
    case RETRO_ENVIRONMENT_GET_AUDIO_VIDEO_ENABLE:
      if (data) *(int *)data = 3;
      return true;
    case RETRO_ENVIRONMENT_SET_PIXEL_FORMAT:
      return data && *(const int *)data == RETRO_PIXEL_FORMAT_XRGB8888;
    case RETRO_ENVIRONMENT_GET_LANGUAGE:
      if (data) *(unsigned *)data = RETRO_LANGUAGE_ENGLISH;
      return true;
    case RETRO_ENVIRONMENT_GET_SYSTEM_DIRECTORY:
      if (data) *(const char **)data = "/emulator/system";
      return true;
    case RETRO_ENVIRONMENT_GET_VARIABLE:
      if (data) {
        struct retro_variable *variable = (struct retro_variable *)data;
        if (strcmp(variable->key, "system_core_override") == 0) variable->value = "Automatic";
        else if (strcmp(variable->key, "system_gb_bios_enable") == 0) variable->value = "OFF";
        else if (strcmp(variable->key, "system_gba_bios_enable") == 0) variable->value = "OFF";
        else if (strcmp(variable->key, "system_nds_bios_enable") == 0) variable->value = "OFF";
        else variable->value = "";
      }
      return true;
    case RETRO_ENVIRONMENT_SET_CORE_OPTIONS_V2:
    case RETRO_ENVIRONMENT_SET_CORE_OPTIONS_V2_INTL:
    case RETRO_ENVIRONMENT_SET_CORE_OPTIONS:
    case RETRO_ENVIRONMENT_SET_INPUT_DESCRIPTORS:
    case RETRO_ENVIRONMENT_SET_MEMORY_MAPS:
      return true;
    default:
      return false;
  }
}

static void skyemu_video(const void *data, unsigned width, unsigned height, size_t pitch) {
  if (!data || width == 0 || height == 0) return;
  const size_t row_bytes = (size_t)width * 4;
  ensure_frame_capacity(row_bytes * height);
  if (!frame_buffer) return;
  for (unsigned row = 0; row < height; row += 1) {
    memcpy(frame_buffer + row * row_bytes, (const uint8_t *)data + row * pitch, row_bytes);
  }
  frame_width = width;
  frame_height = height;
  frame_bytes = row_bytes * height;
}

static size_t skyemu_audio(const int16_t *data, size_t frames) {
  if (!data || frames == 0) return frames;
  ensure_audio_capacity(frames * 2);
  if (!audio_buffer) return frames;
  memcpy(audio_buffer, data, frames * 2 * sizeof(int16_t));
  audio_frames = frames;
  return frames;
}

static void skyemu_input_poll(void) {}

static bool button_down(unsigned id) {
  return (buttons & (1u << id)) != 0;
}

static int16_t skyemu_input_state(unsigned port, unsigned device, unsigned index, unsigned id) {
  (void)port;
  (void)index;
  if (device == RETRO_DEVICE_JOYPAD) {
    switch (id) {
      case RETRO_DEVICE_ID_JOYPAD_A: return button_down(SKYEMU_A);
      case RETRO_DEVICE_ID_JOYPAD_B: return button_down(SKYEMU_B);
      case RETRO_DEVICE_ID_JOYPAD_X: return button_down(SKYEMU_X);
      case RETRO_DEVICE_ID_JOYPAD_Y: return button_down(SKYEMU_Y);
      case RETRO_DEVICE_ID_JOYPAD_L: return button_down(SKYEMU_L);
      case RETRO_DEVICE_ID_JOYPAD_R: return button_down(SKYEMU_R);
      case RETRO_DEVICE_ID_JOYPAD_UP: return button_down(SKYEMU_UP);
      case RETRO_DEVICE_ID_JOYPAD_DOWN: return button_down(SKYEMU_DOWN);
      case RETRO_DEVICE_ID_JOYPAD_LEFT: return button_down(SKYEMU_LEFT);
      case RETRO_DEVICE_ID_JOYPAD_RIGHT: return button_down(SKYEMU_RIGHT);
      case RETRO_DEVICE_ID_JOYPAD_SELECT: return button_down(SKYEMU_SELECT);
      case RETRO_DEVICE_ID_JOYPAD_START: return button_down(SKYEMU_START);
      default: return 0;
    }
  }
  if (device == RETRO_DEVICE_POINTER) {
    if (id == RETRO_DEVICE_ID_POINTER_X) return touch_x;
    if (id == RETRO_DEVICE_ID_POINTER_Y) return touch_y;
    if (id == RETRO_DEVICE_ID_POINTER_PRESSED) return touch_pressed;
  }
  return 0;
}

SKYEMU_EXPORT int skyemu_init(void) {
  retro_set_environment(skyemu_environment);
  retro_set_video_refresh(skyemu_video);
  retro_set_audio_sample_batch(skyemu_audio);
  retro_set_input_poll(skyemu_input_poll);
  retro_set_input_state(skyemu_input_state);
  retro_init();
  return 1;
}

SKYEMU_EXPORT int skyemu_load(const void *rom, size_t bytes, const char *path) {
  if (!rom || bytes == 0 || !path) return 0;
  struct retro_game_info game = {
    .path = path,
    .data = rom,
    .size = bytes,
    .meta = NULL,
  };
  return retro_load_game(&game) ? 1 : 0;
}

SKYEMU_EXPORT void skyemu_step(void) {
  frame_bytes = 0;
  audio_frames = 0;
  retro_run();
}

SKYEMU_EXPORT void skyemu_reset(void) { retro_reset(); }

SKYEMU_EXPORT void skyemu_unload(void) {
  retro_unload_game();
  buttons = 0;
  touch_pressed = false;
  frame_bytes = 0;
  audio_frames = 0;
}

SKYEMU_EXPORT void skyemu_set_button(unsigned id, int pressed) {
  if (id > SKYEMU_START) return;
  if (pressed) buttons |= 1u << id;
  else buttons &= ~(1u << id);
}

SKYEMU_EXPORT void skyemu_set_touch(unsigned x, unsigned y, int pressed) {
  touch_x = (int16_t)(x > 255 ? 255 : x);
  touch_y = (int16_t)(y > 191 ? 191 : y);
  touch_pressed = pressed != 0;
}

SKYEMU_EXPORT uintptr_t skyemu_frame_ptr(void) { return (uintptr_t)frame_buffer; }
SKYEMU_EXPORT uint32_t skyemu_frame_width(void) { return frame_width; }
SKYEMU_EXPORT uint32_t skyemu_frame_height(void) { return frame_height; }
SKYEMU_EXPORT size_t skyemu_frame_bytes(void) { return frame_bytes; }
SKYEMU_EXPORT uintptr_t skyemu_audio_ptr(void) { return (uintptr_t)audio_buffer; }
SKYEMU_EXPORT size_t skyemu_audio_frames(void) { return audio_frames; }

SKYEMU_EXPORT uintptr_t skyemu_save_ptr(void) { return (uintptr_t)retro_get_memory_data(RETRO_MEMORY_SAVE_RAM); }
SKYEMU_EXPORT size_t skyemu_save_bytes(void) { return retro_get_memory_size(RETRO_MEMORY_SAVE_RAM); }
SKYEMU_EXPORT size_t skyemu_state_bytes(void) { return retro_serialize_size(); }
SKYEMU_EXPORT int skyemu_state_write(void *destination, size_t bytes) { return retro_serialize(destination, bytes) ? 1 : 0; }
SKYEMU_EXPORT int skyemu_state_read(const void *source, size_t bytes) { return retro_unserialize(source, bytes) ? 1 : 0; }
