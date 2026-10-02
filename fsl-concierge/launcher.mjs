// bootstrap.mjs intentionally builds runtime source from template strings.
// Use cooked template segments so escaped backticks/interpolations become valid runtime JavaScript.
String.raw = (strings, ...values) => strings.reduce((out, segment, i) => out + segment + (i < values.length ? values[i] : ''), '');
await import('./bootstrap.mjs');
