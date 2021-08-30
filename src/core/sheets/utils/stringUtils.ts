export class StringUtils {
  public static formatNumberToCurrency(value: number): string {
    const localizatedValue = value.toLocaleString('ru', {
      useGrouping: true,
    });
    return localizatedValue.replace(/,/g, ' ');
  }

  public static parseFloat(value: string): number {
    const parsedValue = Number.parseFloat(value.replace(/,/, '.').replace(' ', ''));

    if (!Number.isNaN(parsedValue) && Number.isFinite(parsedValue)) {
      return parsedValue;
    }
    return 0;
  }

  public static convertToNumber(value: string): number {
    return Number(value.replace(/[\s,'"_]/g, ''));
  }

  public static cleanNumber(input: string): string {
    return input.replace(/[\D\n\r\s\t]+/g, '');
  }
}
