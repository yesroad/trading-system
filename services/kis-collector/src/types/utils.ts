// 값 + null 허용
export type Nullable<T> = T | null;

// 값 + null + undefined 허용 (API/옵션용)
export type OptionalNullable<T> = T | null | undefined;
