export function formatNumber(value: number, digits = 1) {
  return new Intl.NumberFormat("ko-KR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatTypology(typology: string) {
  const mapping: Record<string, string> = {
    bar: "바형",
    tower: "타워형",
    courtyard: "중정형",
    podium: "포디움형",
    max_bcr: "BCR 최대 활용",
  };

  return mapping[typology] ?? typology;
}
