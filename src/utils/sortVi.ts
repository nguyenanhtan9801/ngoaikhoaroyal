const viCollator = new Intl.Collator('vi', { sensitivity: 'base', numeric: true });

export const sortByLabelVi = <T,>(items: T[], getLabel: (x: T) => string): T[] =>
  [...items].sort((a, b) => viCollator.compare(getLabel(a), getLabel(b)));
