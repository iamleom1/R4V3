export const profileGenderOptions = [
  "Man",
  "Woman",
  "Non-binary",
  "Prefer to self-describe",
  "Prefer not to say"
] as const;

export const matchPreferenceOptions = ["Men", "Women", "Everyone"] as const;

export function isSelfDescribeGender(value: string) {
  return value.trim().toLowerCase() === "prefer to self-describe";
}

export function normalizeStoredInterestedGenders(values: string[]) {
  const normalized = values
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      if (value === "Man") return "Men";
      if (value === "Woman") return "Women";
      return value;
    });

  if (normalized.includes("Everyone")) {
    return [];
  }

  const unique = Array.from(new Set(normalized));
  if (unique.includes("Men") && unique.includes("Women")) {
    return [];
  }
  return unique;
}

export function expandInterestedGendersForMatching(values: string[]) {
  const normalized = normalizeStoredInterestedGenders(values);
  if (normalized.length === 0 || normalized.includes("Everyone")) {
    return null;
  }

  const expanded = new Set<string>();
  for (const value of normalized) {
    if (value === "Men") {
      expanded.add("man");
      expanded.add("trans man");
    } else if (value === "Women") {
      expanded.add("woman");
      expanded.add("trans woman");
    }
  }

  return expanded;
}
