import { SheetRange } from './sheetRange';

export enum CompareType {
  Equal,
  NotEqual,
  Contains,
  IsEmpty,
  IsNotEmpty,
  Predicate,
}

export interface FilterParam {
  type: CompareType;
  value?: any;
  predicate?: PredicateFunc;
}

type PredicateFunc = (value: any) => boolean;

export interface ColumnParam extends FilterParam {
  column: string;
  type: CompareType;
  value?: any;
  predicate?: PredicateFunc;
}

export interface FilterOptions {
  params: ColumnParam[];
  range: SheetRange;
}
