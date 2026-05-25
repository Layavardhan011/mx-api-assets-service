export const networkMap: Record<string, string> = {
  devnet: "devnet",
  testnet: "testnet",
  mainnet: "",
};

const MAX_PARAM_LENGTH = 255;

export function sanitize(param: unknown): string {
  if (typeof param !== "string") return "";
  if (param.length > MAX_PARAM_LENGTH) return "";
  const clean = param.replace(/[^a-zA-Z0-9_.-]/g, "");
  if (clean.includes("..") || clean.includes("/") || clean.includes("\\")) return "";
  if (clean.length > MAX_PARAM_LENGTH) return "";
  return clean;
}

export function resolveParams(params: { p1?: string; p2?: string; p3?: string }): {
  network: string;
  type: string;
  id: string;
} {
  const p1 = sanitize(params.p1);
  const p2 = sanitize(params.p2);
  const p3 = sanitize(params.p3);

  const networks = ["mainnet", "testnet", "devnet"];
  if (networks.includes(p1)) {
    return { network: p1, type: p2, id: p3 };
  }
  return { network: "mainnet", type: p1, id: p2 };
}

export function getGithubPath(network: string, type: string, id: string = ""): string {
  const base = networkMap[network];
  let path = base ? `${base}/${type}` : type;
  if (id) {
    if (type === "accounts") {
      path = `${path}/${id}.json`;
    } else {
      path = `${path}/${id}/info.json`;
    }
  }
  return path;
}

export function getRawUrl(network: string, type: string, id: string, fileName: string, githubRawBase: string): string {
  const base = networkMap[network];
  if (type === "accounts" && fileName.startsWith("icons/")) {
    return `${githubRawBase}/${base ? base + "/" : ""}accounts/${fileName}`;
  }
  return `${githubRawBase}/${base ? base + "/" : ""}${type}/${id}/${fileName}`;
}
