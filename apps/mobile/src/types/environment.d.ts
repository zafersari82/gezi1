// Metro ortamının tipleri: `process.env.EXPO_PUBLIC_*` değişkenleri ve varlık içe aktarımları.
/// <reference types="expo/types" />

/** Görseller içe aktarıldığında Metro'nun verdiği varlık kimliği. */
declare module "*.png" {
  const source: number;
  export default source;
}
