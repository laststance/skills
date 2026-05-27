type Unbox<T> = T extends Promise<infer U> ? U : T;

type ComplexSource = {
  id: string;
  meta?: Promise<{
    createdAt: string | null;
    labels: Array<string>;
  }>;
  flags?: {
    isEnabled?: boolean;
  };
};

type ComplexAnalyzed<T extends ComplexSource> = Readonly<
  Required<Pick<T, "id" | "meta">>
> &
  Omit<T, "meta"> & {
    normalizedMeta: NonNullable<Unbox<T["meta"]>>;
    status: Extract<
      NonNullable<Unbox<T["meta"]>>["createdAt"] extends string ? "ready" : "pending",
      "ready" | "pending"
    >;
    stableLabels: Record<string, NonNullable<Unbox<T["meta"]>>["labels"][number]>;
  };

export type SyntheticComplexType = ComplexAnalyzed<ComplexSource>;
