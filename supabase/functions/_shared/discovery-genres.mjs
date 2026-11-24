const allowed = new Set([
  "house", "afters", "rave", "edm", "jungle", "techno", "hard techno",
  "tech house", "bass", "trance", "drum and bass", "afro house",
  "deep house", "dubstep", "hardstyle"
]);

const aliases = new Map([
  ["dance/electronic", "edm"], ["electronic dance music", "edm"],
  ["drum & bass", "drum and bass"], ["dnb", "drum and bass"],
  ["hard style", "hardstyle"], ["hardtechno", "hard techno"],
  ["bass music", "bass"], ["afrohouse", "afro house"], ["afterhours", "afters"]
]);

export function allowedDiscoveryGenres(labels) {
  const normalized = labels.map((label) => String(label ?? "").trim().toLowerCase());
  return [...new Set(normalized.map((label) => aliases.get(label) ?? label).filter((label) => allowed.has(label)))];
}

export function marketplaceDiscoveryGenres(labels, text) {
  const evidence = String(text).toLowerCase().replace(/<[^>]*>/g, " ");
  const matches = evidence.match(/\b(?:hard techno|tech house|afro house|deep house|drum (?:and|&) bass|bass music|house music|house(?= (?:and|&) techno\b)|techno|hardstyle|dubstep|dnb|trance music|jungle music|edm|electronic dance music|rave|afters|afterhours)\b/g) ?? [];
  return allowedDiscoveryGenres([...labels, ...matches.map((match) => ({
    "house music": "house", "trance music": "trance", "jungle music": "jungle"
  })[match] ?? match)]);
}

const offGenre = /\b(?:comedy|podcast|worship|ballet|orchestra|country|folk|jazz|hip[ -]hop|rap|reggaeton|rock|punk|metal|alternative|indie|emo|grunge|ska|tribute|trap|breakbeat|garage)\b/i;

export function hasOffGenreEvidence(text) {
  return offGenre.test(text);
}
