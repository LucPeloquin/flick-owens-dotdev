import {
  formatDsDate,
  formatDsTime,
  getDsCalendar,
  getDsClockAngles,
} from "@/lib/ds/clock";

type GlyphMap = Record<string, readonly string[]>;

const SMALL_GLYPHS: GlyphMap = {
  " ": ["000", "000", "000", "000", "000"],
  "/": ["001", "001", "010", "100", "100"],
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
  F: ["111", "100", "110", "100", "100"],
  M: ["101", "111", "111", "101", "101"],
  S: ["111", "100", "111", "001", "111"],
  T: ["111", "010", "010", "010", "010"],
  W: ["101", "101", "111", "111", "101"],
};

const LARGE_GLYPHS: GlyphMap = {
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
};

const CLOCK_PANEL = { x: 16, y: 47, width: 96, height: 96 };
const CLOCK_CENTER = { x: 64, y: 95 };
const CALENDAR_PANEL = { x: 128, y: 47, width: 112, height: 96 };
const CALENDAR_MONTH_HEADER = { x: 128, y: 31, width: 112, height: 16 };
const CALENDAR_WEEKDAYS_Y = 47;
const CALENDAR_DAYS_Y = 63;
const CALENDAR_BOTTOM = 143;
const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function PixelText({
  text,
  x,
  y,
  color,
  scale = 1,
  large = false,
  align = "start",
}: {
  text: string;
  x: number;
  y: number;
  color: string;
  scale?: number;
  large?: boolean;
  align?: "start" | "middle" | "end";
}) {
  const glyphs = large ? LARGE_GLYPHS : SMALL_GLYPHS;
  const glyphWidth = large ? 5 : 3;
  const advance = (glyphWidth + 1) * scale;
  const width = text.length > 0 ? text.length * advance - scale : 0;
  const startX = Math.round(align === "middle" ? x - width / 2 : align === "end" ? x - width : x);

  return (
    <g fill={color} aria-hidden="true">
      {[...text].flatMap((character, characterIndex) => {
        const rows = glyphs[character] ?? glyphs[" "];
        return rows.flatMap((row, rowIndex) => [...row].map((pixel, columnIndex) => (
          pixel === "1" ? (
            <rect
              key={`${characterIndex}-${rowIndex}-${columnIndex}`}
              x={startX + characterIndex * advance + columnIndex * scale}
              y={y + rowIndex * scale}
              width={scale}
              height={scale}
            />
          ) : null
        )));
      })}
    </g>
  );
}

function PanelGrid({
  x,
  y,
  width,
  height,
  step = 4,
  majorStep = 16,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  step?: number;
  majorStep?: number;
}) {
  const vertical = Array.from({ length: Math.floor(width / step) - 1 }, (_, index) => x + (index + 1) * step);
  const horizontal = Array.from({ length: Math.floor(height / step) - 1 }, (_, index) => y + (index + 1) * step);
  const isMajor = (coordinate: number, origin: number) => (coordinate - origin) % majorStep === 0;
  const minorVertical = vertical.filter((lineX) => !isMajor(lineX, x));
  const minorHorizontal = horizontal.filter((lineY) => !isMajor(lineY, y));
  const majorVertical = vertical.filter((lineX) => isMajor(lineX, x));
  const majorHorizontal = horizontal.filter((lineY) => isMajor(lineY, y));
  return (
    <g aria-hidden="true">
      <rect x={x} y={y} width={width} height={height} fill="#f2f3f1" />
      <g stroke="#d9dbda" strokeWidth="0.45">
        {minorVertical.map((lineX) => <line key={`v-${lineX}`} x1={lineX} y1={y} x2={lineX} y2={y + height} />)}
        {minorHorizontal.map((lineY) => <line key={`h-${lineY}`} x1={x} y1={lineY} x2={x + width} y2={lineY} />)}
      </g>
      <g stroke="#b9bcba" strokeWidth="0.7">
        {majorVertical.map((lineX) => <line key={`mv-${lineX}`} x1={lineX} y1={y} x2={lineX} y2={y + height} />)}
        {majorHorizontal.map((lineY) => <line key={`mh-${lineY}`} x1={x} y1={lineY} x2={x + width} y2={lineY} />)}
      </g>
    </g>
  );
}

function AnalogClock({ clock }: { clock: Date }) {
  const angles = getDsClockAngles(clock);
  const markers = Array.from({ length: 12 }, (_, index) => {
    const angle = index * Math.PI / 6;
    return {
      index,
      x: Math.round(CLOCK_CENTER.x + Math.sin(angle) * 37),
      y: Math.round(CLOCK_CENTER.y - Math.cos(angle) * 37),
    };
  });

  return (
    <g aria-hidden="true" shapeRendering="crispEdges">
      <PanelGrid {...CLOCK_PANEL} />
      <rect {...CLOCK_PANEL} fill="none" stroke="#3d4040" strokeWidth="1" />
      {markers.filter(({ index }) => index % 3 !== 0).map(({ index, x, y }) => (
        <rect key={index} x={x - 1} y={y - 1} width="3" height="3" fill="#727574" />
      ))}
      <PixelText text="12" x={CLOCK_CENTER.x} y={51} scale={2} large align="middle" color="#969997" />
      <PixelText text="3" x={101} y={88} scale={2} large align="middle" color="#969997" />
      <PixelText text="6" x={CLOCK_CENTER.x} y={126} scale={2} large align="middle" color="#969997" />
      <PixelText text="9" x={27} y={88} scale={2} large align="middle" color="#969997" />
      <line
        x1={CLOCK_CENTER.x}
        y1={CLOCK_CENTER.y + 2}
        x2={CLOCK_CENTER.x}
        y2={CLOCK_CENTER.y - 21}
        stroke="#777a79"
        strokeWidth="4"
        strokeLinecap="square"
        transform={`rotate(${angles.hour} ${CLOCK_CENTER.x} ${CLOCK_CENTER.y})`}
      />
      <line
        x1={CLOCK_CENTER.x}
        y1={CLOCK_CENTER.y + 3}
        x2={CLOCK_CENTER.x}
        y2={CLOCK_CENTER.y - 31}
        stroke="#3f4242"
        strokeWidth="2"
        strokeLinecap="square"
        transform={`rotate(${angles.minute} ${CLOCK_CENTER.x} ${CLOCK_CENTER.y})`}
      />
      <line
        x1={CLOCK_CENTER.x}
        y1={CLOCK_CENTER.y + 9}
        x2={CLOCK_CENTER.x}
        y2={CLOCK_CENTER.y - 33}
        stroke="#dd2735"
        strokeWidth="1"
        transform={`rotate(${angles.second} ${CLOCK_CENTER.x} ${CLOCK_CENTER.y})`}
      />
      <rect x={CLOCK_CENTER.x - 1} y={CLOCK_CENTER.y - 1} width="3" height="3" fill="#252828" />
    </g>
  );
}

function NativeCalendar({ clock }: { clock: Date }) {
  const calendar = getDsCalendar(clock);
  const weekCount = calendar.weekCount;
  const rowEdges = Array.from({ length: weekCount + 1 }, (_, index) => (
    Math.round(CALENDAR_DAYS_Y + index * (CALENDAR_BOTTOM - CALENDAR_DAYS_Y) / weekCount)
  ));
  const monthYear = `${String(calendar.month).padStart(2, "0")}/${calendar.year}`;
  const visibleDays = calendar.days.slice(0, weekCount * 7);

  return (
    <g aria-hidden="true" shapeRendering="crispEdges">
      <PanelGrid {...CALENDAR_MONTH_HEADER} step={16} />
      <rect {...CALENDAR_MONTH_HEADER} fill="none" stroke="#3d4040" strokeWidth="1" />
      <rect {...CALENDAR_PANEL} fill="#eceeec" stroke="#3d4040" strokeWidth="1" />
      <rect x={CALENDAR_PANEL.x} y={CALENDAR_WEEKDAYS_Y} width="16" height={CALENDAR_BOTTOM - CALENDAR_WEEKDAYS_Y} fill="#f5b2bd" />
      <rect x={CALENDAR_PANEL.x + 96} y={CALENDAR_WEEKDAYS_Y} width="16" height={CALENDAR_BOTTOM - CALENDAR_WEEKDAYS_Y} fill="#9ebcf5" />
      <rect x={CALENDAR_PANEL.x} y={CALENDAR_WEEKDAYS_Y} width="16" height="16" fill="#dc2540" />
      <rect x={CALENDAR_PANEL.x + 96} y={CALENDAR_WEEKDAYS_Y} width="16" height="16" fill="#1761c9" />
      <PixelText text={monthYear} x={184} y={36} align="middle" color="#4f5251" />
      {WEEKDAY_LABELS.map((label, index) => (
        <PixelText
          key={`${label}-${index}`}
          text={label}
          x={CALENDAR_PANEL.x + index * 16 + 8}
          y={52}
          align="middle"
          color={index === 0 || index === 6 ? "#ffffff" : "#323535"}
        />
      ))}
      <g stroke="#777a79" strokeWidth="0.7">
        <line x1={CALENDAR_PANEL.x} y1={CALENDAR_DAYS_Y} x2={CALENDAR_PANEL.x + CALENDAR_PANEL.width} y2={CALENDAR_DAYS_Y} />
        {Array.from({ length: 6 }, (_, index) => CALENDAR_PANEL.x + (index + 1) * 16).map((lineX) => (
          <line key={`column-${lineX}`} x1={lineX} y1={CALENDAR_WEEKDAYS_Y} x2={lineX} y2={CALENDAR_BOTTOM} />
        ))}
        {rowEdges.slice(1, -1).map((lineY) => (
          <line key={`row-${lineY}`} x1={CALENDAR_PANEL.x} y1={lineY} x2={CALENDAR_PANEL.x + CALENDAR_PANEL.width} y2={lineY} />
        ))}
      </g>
      {visibleDays.map((day, index) => {
        if (day === null) return null;
        const column = index % 7;
        const row = Math.floor(index / 7);
        const rowTop = rowEdges[row];
        const rowBottom = rowEdges[row + 1];
        const isToday = day === calendar.day;
        const color = column === 0 ? "#a4112b" : column === 6 ? "#1249a4" : "#292c2c";
        return (
          <g key={day}>
            {isToday && (
              <rect
                x={CALENDAR_PANEL.x + column * 16 + 1}
                y={rowTop + 1}
                width="14"
                height={Math.max(7, rowBottom - rowTop - 2)}
                fill="none"
                stroke="#202323"
                strokeWidth="1"
              />
            )}
            <PixelText
              text={String(day)}
              x={CALENDAR_PANEL.x + column * 16 + 8}
              y={rowTop + Math.max(1, Math.floor((rowBottom - rowTop - 5) / 2))}
              align="middle"
              color={color}
            />
          </g>
        );
      })}
      <rect {...CALENDAR_PANEL} fill="none" stroke="#3d4040" strokeWidth="1" />
    </g>
  );
}

export function DsNativeClockCalendar({ clock }: { clock: Date }) {
  const calendar = getDsCalendar(clock);
  const label = `Analog clock showing ${formatDsTime(clock)} Las Vegas time. ${calendar.monthLabel} calendar; today is ${formatDsDate(clock)}.`;

  return (
    <svg
      className="ds-native-clock-calendar"
      viewBox="0 0 256 192"
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      <AnalogClock clock={clock} />
      <NativeCalendar clock={clock} />
    </svg>
  );
}
