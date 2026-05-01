export const profileGenderOptions = [
  "Male",
  "Female",
  "Non-binary",
  "Prefer not to say"
] as const;

export const matchPreferenceOptions = ["Male", "Female", "Everyone"] as const;

export function normalizeStoredInterestedGenders(values: string[]) {
  const normalized = values
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      if (value === "Man" || value === "Male") return "Male";
      if (value === "Woman" || value === "Female") return "Female";
      if (value === "Men") return "Male";
      if (value === "Women") return "Female";
      return value;
    });

  if (normalized.includes("Everyone")) {
    return [];
  }

  const unique = Array.from(new Set(normalized));
  if (unique.includes("Male") && unique.includes("Female")) {
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
    if (value === "Male") {
      expanded.add("man");
      expanded.add("male");
      expanded.add("trans man");
    } else if (value === "Female") {
      expanded.add("woman");
      expanded.add("female");
      expanded.add("trans woman");
    }
  }

  return expanded;
}
