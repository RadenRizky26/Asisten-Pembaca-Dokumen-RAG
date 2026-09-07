export const bersihkanTeks = (text: string): string => {
  return text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
};
