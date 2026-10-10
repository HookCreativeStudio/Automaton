import whoiser from "whoiser";

export async function lookupDomain(domain) {
  const result = await whoiser(domain, { follow: 1, timeout: 10000 });
  const data = Object.values(result)[0] || {};
  const toArray = v => (Array.isArray(v) ? v : [v]).filter(Boolean);
  return {
    domain,
    registrar: data["Registrar"] || data["registrar"] || null,
    created: data["Created Date"] || data["creation date"] || null,
    expires: data["Registry Expiry Date"] || data["expiry date"] || null,
    updated: data["Updated Date"] || data["updated date"] || null,
    status: toArray(data["Domain Status"] || data["Status"]),
    nameservers: toArray(data["Name Server"] || data["Nameservers"]),
  };
}
