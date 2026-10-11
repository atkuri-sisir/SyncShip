export type Courier = {
  key: string;
  name: string;
  /** 17TRACK carrier code (only used if an operator configures the optional TRACK17_KEY) */
  code?: number;
  /** Official tracking page; {awb} is replaced with the tracking number. null = no link. */
  trackUrl: string | null;
  /** slug on trackcourier.io, used only for a pre-filled "quick check" link */
  quickSlug?: string;
  /** true when SyncShip can fetch status itself without any key */
  auto?: boolean;
};

export const COURIERS: Courier[] = [
  {
    key: "shadowfax",
    quickSlug: "shadowfax",
    name: "Shadowfax",
    code: 100102,
    trackUrl: "https://www.shadowfax.in/track",
    auto: true,
  },
  {
    key: "delhivery",
    quickSlug: "delhivery-courier",
    name: "Delhivery",
    code: 100060,
    trackUrl: "https://www.delhivery.com/track-v2/package/{awb}",
  },
  {
    key: "dtdc",
    quickSlug: "dtdc",
    name: "DTDC",
    code: 100069,
    trackUrl: "https://www.dtdc.com/track-your-shipment/",
  },
  {
    key: "speedpost",
    quickSlug: "speed-post",
    name: "Speed Post",
    code: 9021,
    trackUrl: "https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx",
  },
  {
    key: "professional",
    quickSlug: "professional-courier",
    name: "Professional Courier",
    code: 100279,
    trackUrl: "https://www.tpcglobe.com/",
  },
  { key: "bluedart", quickSlug: "blue-dart-courier", name: "Blue Dart", trackUrl: "https://www.bluedart.com/tracking" },
  { key: "xpressbees", quickSlug: "xpressbees-logistics", name: "XpressBees", trackUrl: "https://www.xpressbees.com/shipment/tracking" },
  { key: "ekart", quickSlug: "ekart-logistics-courier", name: "Ekart (Flipkart)", trackUrl: "https://ekartlogistics.com/shipmenttrack" },
  { key: "trackon", quickSlug: "trackon-courier", name: "Trackon", trackUrl: "https://www.trackon.in/" },
  { key: "other", name: "Other courier", trackUrl: null },
];

export function getCourier(key: string): Courier | undefined {
  return COURIERS.find((c) => c.key === key);
}

export function officialTrackUrl(courierKey: string, awb: string): string | null {
  const c = getCourier(courierKey);
  return c?.trackUrl ? c.trackUrl.replace("{awb}", encodeURIComponent(awb)) : null;
}

/** Pre-filled page on trackcourier.io (third-party, shows ads, may have no data for some parcels). */
export function quickCheckUrl(courierKey: string, awb: string): string | null {
  const slug = getCourier(courierKey)?.quickSlug;
  return slug ? `https://trackcourier.io/track-and-trace/${slug}/${encodeURIComponent(awb)}` : null;
}
