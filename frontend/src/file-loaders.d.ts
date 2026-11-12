declare module '*.html' {
  const text: string;
  export default text;
}

declare module '*.jpg' {
  const bytes: Uint8Array;
  export default bytes;
}
