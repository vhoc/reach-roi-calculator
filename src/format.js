/** Display formatting. Pure functions, no DOM — shared by the screen and the PDF. */

export const formatNumber = (value, decimals) => {
  if (value === null || value === undefined || Number.isNaN(value)) return "0";
  const fixed = decimals !== undefined ? Number(value).toFixed(decimals) : String(Math.round(value));
  const [whole, frac] = fixed.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac ? `${grouped}.${frac}` : grouped;
};

export const formatCurrency = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) return "$0";
  const sign = value < 0 ? "-" : "";
  return `${sign}$${formatNumber(Math.round(Math.abs(value)))}`;
};

/** Compact dollars for hero figures: 306250 -> "$306K", 1250000 -> "$1.25M". */
export const formatCurrencyCompact = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) return "$0";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    const m = abs / 1_000_000;
    return `${sign}$${trimTrailingZeros(m.toFixed(m >= 10 ? 1 : 2))}M`;
  }
  if (abs >= 1000) return `${sign}$${Math.round(abs / 1000)}K`;
  return `${sign}$${formatNumber(Math.round(abs))}`;
};

const trimTrailingZeros = (s) => s.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");

export const formatPercent = (value, decimals = 0) => `${formatNumber(value * 100, decimals)}%`;

export const formatDateToday = () =>
  new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
