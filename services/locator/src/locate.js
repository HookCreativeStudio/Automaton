import axios from "axios";

export async function locateIP(ip) {
  const { data } = await axios.get(`http://ip-api.com/json/${encodeURIComponent(ip)}`, {
    params: {
      fields: "status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query",
    },
    timeout: 8000,
  });
  if (data.status === "fail") throw new Error(data.message || "IP lookup failed");
  return {
    ip: data.query,
    country: data.country,
    country_code: data.countryCode,
    region: data.regionName,
    region_code: data.region,
    city: data.city,
    zip: data.zip,
    lat: data.lat,
    lon: data.lon,
    timezone: data.timezone,
    isp: data.isp,
    org: data.org,
    as: data.as,
  };
}
