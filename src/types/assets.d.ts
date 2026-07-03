// Type shims for non-TS asset imports handled by Metro/Expo at runtime.
declare module "*.css";

declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module "*.png" {
  const value: number;
  export default value;
}

declare module "*.jpg" {
  const value: number;
  export default value;
}

declare module "*.svg" {
  const value: number;
  export default value;
}
