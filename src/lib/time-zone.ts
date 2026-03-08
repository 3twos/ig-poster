const DATE_TIME_INPUT_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

type TimeZoneDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const getTimeZoneParts = (
  date: Date,
  timeZone: string,
): TimeZoneDateParts => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
};

const partsToUtcTimestamp = (parts: TimeZoneDateParts) =>
  Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

export const formatDateTimeLocalInput = (iso: string, timeZone: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const parts = getTimeZoneParts(date, timeZone);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
};

export const parseDateTimeLocalInput = (
  value: string,
  timeZone: string,
) => {
  const match = DATE_TIME_INPUT_PATTERN.exec(value);
  if (!match) {
    return null;
  }

  const [
    ,
    yearString,
    monthString,
    dayString,
    hourString,
    minuteString,
  ] = match;
  const targetParts: TimeZoneDateParts = {
    year: Number(yearString),
    month: Number(monthString),
    day: Number(dayString),
    hour: Number(hourString),
    minute: Number(minuteString),
    second: 0,
  };

  const expectedUtcTimestamp = partsToUtcTimestamp(targetParts);
  let guess = expectedUtcTimestamp;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const observedParts = getTimeZoneParts(new Date(guess), timeZone);
    const adjustment =
      expectedUtcTimestamp - partsToUtcTimestamp(observedParts);
    if (adjustment === 0) {
      break;
    }
    guess += adjustment;
  }

  const parsed = new Date(guess);
  const normalizedParts = getTimeZoneParts(parsed, timeZone);
  const matchesTarget =
    normalizedParts.year === targetParts.year &&
    normalizedParts.month === targetParts.month &&
    normalizedParts.day === targetParts.day &&
    normalizedParts.hour === targetParts.hour &&
    normalizedParts.minute === targetParts.minute;

  return matchesTarget ? parsed : null;
};

export const formatDateTimeInTimeZone = (
  iso: string,
  timeZone: string,
  options?: Intl.DateTimeFormatOptions,
) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    ...options,
  }).format(date);
};
