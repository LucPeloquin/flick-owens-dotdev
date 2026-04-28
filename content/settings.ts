// Data-driven Wii System Settings. Add a new page = one entry here.
// Each page has a list of rows; some rows have an `egg` that fires on click.

export type SettingsEgg =
  | { kind: "message"; title: string; body: string }
  | { kind: "sfx"; sound: string; title?: string; body?: string }
  | { kind: "toggle-crt"; title: string; body?: string }
  | { kind: "ir-calibration"; title: string; body?: string }
  | { kind: "format"; title: string; body: string };

export interface SettingsRow {
  label: string;
  value?: string;
  egg?: SettingsEgg;
}

export interface SettingsPage {
  id: string;
  title: string;
  rows: SettingsRow[];
}

export const settingsPages: SettingsPage[] = [
  {
    id: "wii",
    title: "Wii Settings 1",
    rows: [
      {
        label: "Screen",
        value: "50 Hz (PAL)",
        egg: {
          kind: "toggle-crt",
          title: "CRT Mode",
          body: "Enabled the authentic CRT flicker. Toggle again to return to a flat-panel.",
        },
      },
      {
        label: "Sound",
        value: "Surround",
        egg: {
          kind: "sfx",
          sound: "select",
          title: "Channel test",
          body: "You should hear the menu select chime.",
        },
      },
      {
        label: "Parental Controls",
        value: "Off",
        egg: {
          kind: "message",
          title: "PIN requested",
          body: "1337. Welcome, administrator.",
        },
      },
    ],
  },
  {
    id: "wii2",
    title: "Wii Settings 2",
    rows: [
      {
        label: "Sensor Bar",
        value: "Above TV",
        egg: {
          kind: "ir-calibration",
          title: "IR Calibration",
          body: "Track the dots with your cursor to calibrate your IR bar.",
        },
      },
      {
        label: "Internet",
        value: "Wii LAN Adapter",
        egg: {
          kind: "message",
          title: "Connection test",
          body: "Error Code 51330: your router denied the Wii. (Classic.)",
        },
      },
      {
        label: "Console Information",
        value: "4.3U",
        egg: {
          kind: "message",
          title: "About this Wii",
          body: "Serial: LU-64-FLICK. Region: NTSC. Warranty: expired in 2012 — still works.",
        },
      },
    ],
  },
  {
    id: "wii3",
    title: "Wii Settings 3",
    rows: [
      {
        label: "Calendar",
        value: "Today",
        egg: {
          kind: "message",
          title: "Calendar",
          body: "It is always a good day to ship.",
        },
      },
      {
        label: "Country",
        value: "Cyberspace",
        egg: {
          kind: "message",
          title: "Region locked",
          body: "You've been granted temporary access to the Flick region.",
        },
      },
      {
        label: "Format Wii System Memory",
        egg: {
          kind: "format",
          title: "Are you sure?",
          body: "This would permanently erase all saved data. Don't worry — this button does nothing. Probably.",
        },
      },
    ],
  },
];
