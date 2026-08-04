function appendClassNames(value, classNames) {
  if (!value) return;

  if (typeof value === "string" || typeof value === "number") {
    classNames.push(String(value));
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => appendClassNames(item, classNames));
    return;
  }

  if (typeof value === "object") {
    Object.entries(value).forEach(([className, enabled]) => {
      if (enabled) classNames.push(className);
    });
  }
}

export function cn(...values) {
  const classNames = [];
  values.forEach((value) => appendClassNames(value, classNames));
  return classNames.join(" ");
}
