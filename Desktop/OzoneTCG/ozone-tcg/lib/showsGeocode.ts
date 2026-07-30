// Static city geocoding for card-show radius filtering.
// Covers the most common US cities where card shows occur.
// Keys are "City||ST" (case-normalized). Values are [lat, lon].
// No external API calls — lookup is O(1).

const COORDS: Record<string, [number, number]> = {
  // California
  "Los Angeles||CA":    [34.0522, -118.2437],
  "San Diego||CA":      [32.7157, -117.1611],
  "San Jose||CA":       [37.3382, -121.8863],
  "San Francisco||CA":  [37.7749, -122.4194],
  "Fresno||CA":         [36.7378, -119.7871],
  "Sacramento||CA":     [38.5816, -121.4944],
  "Long Beach||CA":     [33.7701, -118.1937],
  "Oakland||CA":        [37.8044, -122.2712],
  "Bakersfield||CA":    [35.3733, -119.0187],
  "Anaheim||CA":        [33.8366, -117.9143],
  "Santa Ana||CA":      [33.7455, -117.8677],
  "Riverside||CA":      [33.9806, -117.3755],
  "Stockton||CA":       [37.9577, -121.2908],
  "Irvine||CA":         [33.6846, -117.8265],
  "Chula Vista||CA":    [32.6401, -117.0842],
  "San Bernardino||CA": [34.1083, -117.2898],
  "Modesto||CA":        [37.6391, -120.9969],
  "Glendale||CA":       [34.1425, -118.2551],
  "Pasadena||CA":       [34.1478, -118.1445],
  "Ontario||CA":        [34.0633, -117.6509],
  "Pomona||CA":         [34.0551, -117.7500],
  "Torrance||CA":       [33.8358, -118.3406],
  "Escondido||CA":      [33.1192, -117.0864],
  "Roseville||CA":      [38.7521, -121.2880],
  "Hayward||CA":        [37.6688, -122.0808],
  "Sunnyvale||CA":      [37.3688, -122.0363],
  "Salinas||CA":        [36.6777, -121.6555],
  "Santa Rosa||CA":     [38.4405, -122.7141],
  "Santa Clarita||CA":  [34.3917, -118.5426],
  "Thousand Oaks||CA":  [34.1706, -118.8376],
  "Simi Valley||CA":    [34.2694, -118.7815],
  "Concord||CA":        [37.9779, -122.0311],
  "Santa Clara||CA":    [37.3541, -121.9552],
  "Elk Grove||CA":      [38.4088, -121.3716],
  "Visalia||CA":        [36.3302, -119.2921],
  "Victorville||CA":    [34.5362, -117.2928],
  "Orange||CA":         [33.7879, -117.8531],
  // Texas
  "Houston||TX":        [29.7604, -95.3698],
  "San Antonio||TX":    [29.4241, -98.4936],
  "Dallas||TX":         [32.7767, -96.7970],
  "Austin||TX":         [30.2672, -97.7431],
  "Fort Worth||TX":     [32.7555, -97.3308],
  "El Paso||TX":        [31.7619, -106.4850],
  "Arlington||TX":      [32.7357, -97.1081],
  "Corpus Christi||TX": [27.8006, -97.3964],
  "Plano||TX":          [33.0198, -96.6989],
  "Lubbock||TX":        [33.5779, -101.8552],
  "Laredo||TX":         [27.5306, -99.4803],
  "Irving||TX":         [32.8140, -96.9489],
  "Garland||TX":        [32.9126, -96.6389],
  "Frisco||TX":         [33.1507, -96.8236],
  "Amarillo||TX":       [35.2220, -101.8313],
  "McKinney||TX":       [33.1972, -96.6397],
  "Grand Prairie||TX":  [32.7460, -96.9978],
  "Killeen||TX":        [31.1171, -97.7278],
  "Beaumont||TX":       [30.0860, -94.1018],
  "Mesquite||TX":       [32.7668, -96.5992],
  "Pasadena||TX":       [29.6911, -95.2091],
  "McAllen||TX":        [26.2034, -98.2300],
  "Waco||TX":           [31.5493, -97.1467],
  "Midland||TX":        [31.9973, -102.0779],
  "Carrollton||TX":     [32.9537, -96.8903],
  "Lewisville||TX":     [33.0462, -96.9942],
  // Florida
  "Jacksonville||FL":   [30.3322, -81.6557],
  "Miami||FL":          [25.7617, -80.1918],
  "Tampa||FL":          [27.9506, -82.4572],
  "Orlando||FL":        [28.5383, -81.3792],
  "St. Petersburg||FL": [27.7676, -82.6403],
  "Hialeah||FL":        [25.8576, -80.2781],
  "Tallahassee||FL":    [30.4518, -84.2807],
  "Fort Lauderdale||FL":[26.1224, -80.1373],
  "Pembroke Pines||FL": [26.0076, -80.2963],
  "Hollywood||FL":      [26.0112, -80.1495],
  "Gainesville||FL":    [29.6516, -82.3248],
  "Miramar||FL":        [25.9871, -80.2322],
  "Coral Springs||FL":  [26.2712, -80.2706],
  "Cape Coral||FL":     [26.5629, -81.9495],
  "Clearwater||FL":     [27.9659, -82.8001],
  "Palm Bay||FL":       [28.0345, -80.5887],
  "Lakeland||FL":       [28.0395, -81.9498],
  "Pompano Beach||FL":  [26.2379, -80.1248],
  "West Palm Beach||FL":[26.7153, -80.0534],
  "Daytona Beach||FL":  [29.2108, -81.0228],
  "Fort Myers||FL":     [26.6406, -81.8723],
  "Kissimmee||FL":      [28.2919, -81.4076],
  // New York
  "New York||NY":       [40.7128, -74.0060],
  "Buffalo||NY":        [42.8864, -78.8784],
  "Rochester||NY":      [43.1566, -77.6088],
  "Yonkers||NY":        [40.9312, -73.8988],
  "Syracuse||NY":       [43.0481, -76.1474],
  "Albany||NY":         [42.6526, -73.7562],
  "New Rochelle||NY":   [40.9115, -73.7823],
  "Mount Vernon||NY":   [40.9126, -73.8371],
  "Schenectady||NY":    [42.8142, -73.9396],
  "Utica||NY":          [43.1009, -75.2327],
  // Illinois
  "Chicago||IL":        [41.8781, -87.6298],
  "Aurora||IL":         [41.7606, -88.3201],
  "Rockford||IL":       [42.2711, -89.0940],
  "Joliet||IL":         [41.5250, -88.0817],
  "Naperville||IL":     [41.7508, -88.1535],
  "Springfield||IL":    [39.7817, -89.6501],
  "Peoria||IL":         [40.6936, -89.5890],
  "Elgin||IL":          [42.0354, -88.2826],
  "Waukegan||IL":       [42.3636, -87.8448],
  "Cicero||IL":         [41.8456, -87.7539],
  // Ohio
  "Columbus||OH":       [39.9612, -82.9988],
  "Cleveland||OH":      [41.4993, -81.6944],
  "Cincinnati||OH":     [39.1031, -84.5120],
  "Toledo||OH":         [41.6639, -83.5552],
  "Akron||OH":          [41.0814, -81.5190],
  "Dayton||OH":         [39.7589, -84.1916],
  "Parma||OH":          [41.3848, -81.7229],
  "Canton||OH":         [40.7989, -81.3784],
  "Lorain||OH":         [41.4528, -82.1824],
  "Youngstown||OH":     [41.0998, -80.6495],
  // Pennsylvania
  "Philadelphia||PA":   [39.9526, -75.1652],
  "Pittsburgh||PA":     [40.4406, -79.9959],
  "Allentown||PA":      [40.6023, -75.4714],
  "Erie||PA":           [42.1292, -80.0851],
  "Reading||PA":        [40.3356, -75.9269],
  "Scranton||PA":       [41.4090, -75.6624],
  "Bethlehem||PA":      [40.6259, -75.3705],
  "Lancaster||PA":      [40.0379, -76.3055],
  "Harrisburg||PA":     [40.2732, -76.8867],
  // Georgia
  "Atlanta||GA":        [33.7490, -84.3880],
  "Columbus||GA":       [32.4610, -84.9877],
  "Savannah||GA":       [32.0835, -81.0998],
  "Augusta||GA":        [33.4735, -82.0105],
  "Athens||GA":         [33.9519, -83.3576],
  "Macon||GA":          [32.8407, -83.6324],
  // Michigan
  "Detroit||MI":        [42.3314, -83.0458],
  "Grand Rapids||MI":   [42.9634, -85.6681],
  "Warren||MI":         [42.4775, -83.0277],
  "Sterling Heights||MI":[42.5803, -83.0302],
  "Lansing||MI":        [42.7325, -84.5555],
  "Ann Arbor||MI":      [42.2808, -83.7430],
  "Flint||MI":          [43.0125, -83.6875],
  "Dearborn||MI":       [42.3223, -83.1763],
  "Livonia||MI":        [42.3681, -83.3527],
  "Westland||MI":       [42.3242, -83.3993],
  // North Carolina
  "Charlotte||NC":      [35.2271, -80.8431],
  "Raleigh||NC":        [35.7796, -78.6382],
  "Greensboro||NC":     [36.0726, -79.7920],
  "Durham||NC":         [35.9940, -78.8986],
  "Winston-Salem||NC":  [36.0999, -80.2442],
  "Fayetteville||NC":   [35.0527, -78.8784],
  // Arizona
  "Phoenix||AZ":        [33.4484, -112.0740],
  "Tucson||AZ":         [32.2226, -110.9747],
  "Mesa||AZ":           [33.4152, -111.8315],
  "Chandler||AZ":       [33.3062, -111.8413],
  "Glendale||AZ":       [33.5387, -112.1860],
  "Scottsdale||AZ":     [33.4942, -111.9261],
  "Gilbert||AZ":        [33.3528, -111.7890],
  "Tempe||AZ":          [33.4255, -111.9400],
  "Peoria||AZ":         [33.5806, -112.2374],
  // Washington
  "Seattle||WA":        [47.6062, -122.3321],
  "Spokane||WA":        [47.6588, -117.4260],
  "Tacoma||WA":         [47.2529, -122.4443],
  "Vancouver||WA":      [45.6387, -122.6615],
  "Bellevue||WA":       [47.6101, -122.2015],
  "Kent||WA":           [47.3809, -122.2348],
  // Colorado
  "Denver||CO":         [39.7392, -104.9903],
  "Colorado Springs||CO":[38.8339, -104.8214],
  "Aurora||CO":         [39.7294, -104.8319],
  "Fort Collins||CO":   [40.5853, -105.0844],
  "Lakewood||CO":       [39.7047, -105.0814],
  "Thornton||CO":       [39.8680, -104.9719],
  "Arvada||CO":         [39.8028, -105.0875],
  "Westminster||CO":    [39.8366, -105.0372],
  "Pueblo||CO":         [38.2544, -104.6091],
  // Nevada
  "Las Vegas||NV":      [36.1699, -115.1398],
  "Henderson||NV":      [36.0397, -114.9819],
  "Reno||NV":           [39.5296, -119.8138],
  "North Las Vegas||NV":[36.1989, -115.1175],
  "Sparks||NV":         [39.5349, -119.7527],
  // Missouri
  "Kansas City||MO":    [39.0997, -94.5786],
  "St. Louis||MO":      [38.6270, -90.1994],
  "Springfield||MO":    [37.2090, -93.2923],
  "Columbia||MO":       [38.9517, -92.3341],
  "Independence||MO":   [39.0911, -94.4155],
  // Indiana
  "Indianapolis||IN":   [39.7684, -86.1581],
  "Fort Wayne||IN":     [41.0793, -85.1394],
  "Evansville||IN":     [37.9716, -87.5711],
  "South Bend||IN":     [41.6764, -86.2520],
  "Carmel||IN":         [39.9784, -86.1180],
  // Virginia
  "Virginia Beach||VA": [36.8529, -75.9780],
  "Norfolk||VA":        [36.8508, -76.2859],
  "Chesapeake||VA":     [36.7682, -76.2875],
  "Richmond||VA":       [37.5407, -77.4360],
  "Newport News||VA":   [37.0871, -76.4730],
  "Alexandria||VA":     [38.8048, -77.0469],
  // Tennessee
  "Nashville||TN":      [36.1627, -86.7816],
  "Memphis||TN":        [35.1495, -90.0490],
  "Knoxville||TN":      [35.9606, -83.9207],
  "Chattanooga||TN":    [35.0456, -85.3097],
  "Clarksville||TN":    [36.5298, -87.3595],
  // Minnesota
  "Minneapolis||MN":    [44.9778, -93.2650],
  "St. Paul||MN":       [44.9537, -93.0900],
  "Rochester||MN":      [44.0121, -92.4802],
  "Duluth||MN":         [46.7867, -92.1005],
  "Bloomington||MN":    [44.8408, -93.3216],
  // Massachusetts
  "Boston||MA":         [42.3601, -71.0589],
  "Worcester||MA":      [42.2626, -71.8023],
  "Springfield||MA":    [42.1015, -72.5898],
  "Lowell||MA":         [42.6334, -71.3162],
  "Cambridge||MA":      [42.3736, -71.1097],
  // Wisconsin
  "Milwaukee||WI":      [43.0389, -87.9065],
  "Madison||WI":        [43.0731, -89.4012],
  "Green Bay||WI":      [44.5133, -88.0133],
  "Kenosha||WI":        [42.5847, -87.8212],
  "Racine||WI":         [42.7261, -87.7829],
  // Maryland
  "Baltimore||MD":      [39.2904, -76.6122],
  "Columbia||MD":       [39.2037, -76.8610],
  "Germantown||MD":     [39.1734, -77.2717],
  "Silver Spring||MD":  [38.9907, -77.0261],
  // Oregon
  "Portland||OR":       [45.5051, -122.6750],
  "Salem||OR":          [44.9429, -123.0351],
  "Eugene||OR":         [44.0521, -123.0868],
  "Gresham||OR":        [45.4929, -122.4286],
  "Hillsboro||OR":      [45.5229, -122.9898],
  // Oklahoma
  "Oklahoma City||OK":  [35.4676, -97.5164],
  "Tulsa||OK":          [36.1540, -95.9928],
  "Norman||OK":         [35.2226, -97.4395],
  "Broken Arrow||OK":   [36.0526, -95.7908],
  // Kentucky
  "Louisville||KY":     [38.2527, -85.7585],
  "Lexington||KY":      [38.0406, -84.5037],
  "Bowling Green||KY":  [36.9685, -86.4808],
  // South Carolina
  "Columbia||SC":       [34.0007, -81.0348],
  "Charleston||SC":     [32.7765, -79.9311],
  "North Charleston||SC":[32.8546, -79.9748],
  // Alabama
  "Birmingham||AL":     [33.5186, -86.8104],
  "Montgomery||AL":     [32.3792, -86.3077],
  "Huntsville||AL":     [34.7304, -86.5861],
  "Mobile||AL":         [30.6954, -88.0399],
  // Louisiana
  "New Orleans||LA":    [29.9511, -90.0715],
  "Baton Rouge||LA":    [30.4515, -91.1871],
  "Shreveport||LA":     [32.5252, -93.7502],
  "Metairie||LA":       [29.9843, -90.1624],
  // Iowa
  "Des Moines||IA":     [41.5868, -93.6250],
  "Cedar Rapids||IA":   [41.9779, -91.6656],
  "Davenport||IA":      [41.5236, -90.5776],
  // Kansas
  "Wichita||KS":        [37.6872, -97.3301],
  "Overland Park||KS":  [38.9822, -94.6708],
  "Kansas City||KS":    [39.1142, -94.6275],
  // Utah
  "Salt Lake City||UT": [40.7608, -111.8910],
  "West Valley City||UT":[40.6916, -112.0010],
  "Provo||UT":          [40.2338, -111.6585],
  "West Jordan||UT":    [40.6097, -111.9391],
  // New Mexico
  "Albuquerque||NM":    [35.0844, -106.6504],
  "Las Cruces||NM":     [32.3199, -106.7637],
  "Rio Rancho||NM":     [35.2328, -106.6630],
  // Nebraska
  "Omaha||NE":          [41.2565, -95.9345],
  "Lincoln||NE":        [40.8136, -96.7026],
  // Arkansas
  "Little Rock||AR":    [34.7465, -92.2896],
  "Fort Smith||AR":     [35.3859, -94.3985],
  "Fayetteville||AR":   [36.0626, -94.1574],
  // Mississippi
  "Jackson||MS":        [32.2988, -90.1848],
  "Gulfport||MS":       [30.3674, -89.0928],
  "Southaven||MS":      [34.9890, -90.0126],
  // Connecticut
  "Bridgeport||CT":     [41.1792, -73.1894],
  "New Haven||CT":      [41.3082, -72.9282],
  "Stamford||CT":       [41.0534, -73.5387],
  "Hartford||CT":       [41.7658, -72.6851],
  // Idaho
  "Boise||ID":          [43.6187, -116.2146],
  "Nampa||ID":          [43.5407, -116.5635],
  "Meridian||ID":       [43.6121, -116.3915],
  // Montana
  "Billings||MT":       [45.7833, -108.5007],
  "Missoula||MT":       [46.8721, -113.9940],
  "Great Falls||MT":    [47.5002, -111.3008],
  // Hawaii
  "Honolulu||HI":       [21.3069, -157.8583],
  "Pearl City||HI":     [21.3972, -157.9754],
  "Hilo||HI":           [19.7297, -155.0900],
  // New Hampshire
  "Manchester||NH":     [42.9956, -71.4548],
  "Nashua||NH":         [42.7654, -71.4676],
  "Concord||NH":        [43.2081, -71.5376],
  // Rhode Island
  "Providence||RI":     [41.8240, -71.4128],
  "Cranston||RI":       [41.7798, -71.4373],
  "Warwick||RI":        [41.7001, -71.4162],
  // Maine
  "Portland||ME":       [43.6591, -70.2568],
  "Lewiston||ME":       [44.1004, -70.2148],
  // Vermont
  "Burlington||VT":     [44.4759, -73.2121],
  // West Virginia
  "Charleston||WV":     [38.3498, -81.6326],
  "Huntington||WV":     [38.4192, -82.4452],
  // Delaware
  "Wilmington||DE":     [39.7447, -75.5484],
  "Dover||DE":          [39.1582, -75.5244],
  // Alaska
  "Anchorage||AK":      [61.2181, -149.9003],
  "Fairbanks||AK":      [64.8378, -147.7164],
  // Washington DC
  "Washington||DC":     [38.9072, -77.0369],
};

export type GeoResult = { lat: number; lon: number };

/**
 * Look up approximate coordinates for a US city.
 * Tries exact match, then case-insensitive, then without common suffixes.
 */
export function geocodeCity(city: string, state: string): GeoResult | null {
  const key = `${titleCase(city)}||${state.toUpperCase()}`;
  const coords = COORDS[key];
  if (coords) return { lat: coords[0], lon: coords[1] };

  // Case-insensitive scan (linear, but only used as fallback)
  const lower = city.toLowerCase() + "||" + state.toUpperCase();
  for (const [k, v] of Object.entries(COORDS)) {
    if (k.toLowerCase() === lower) return { lat: v[0], lon: v[1] };
  }

  return null;
}

function titleCase(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Parse "City, ST" or "City, ST ZIPCODE" from a free-text address.
 * Returns null if city/state cannot be determined.
 */
export function parseCityStateFromAddress(address: string): { city: string; state: string } | null {
  // Match trailing "City, ST" or "City, ST NNNNN"
  const m = address.match(/([^,]+),\s*([A-Z]{2})\b/i);
  if (!m) return null;

  // Take the last match (most specific)
  const matches: RegExpMatchArray[] = [];
  const re = /([^,]+),\s*([A-Z]{2})\b/gi;
  let match: RegExpMatchArray | null;
  while ((match = re.exec(address)) !== null) matches.push(match);

  const last = matches[matches.length - 1] ?? m;
  return { city: last[1].trim(), state: last[2].toUpperCase() };
}

/** Earth-surface distance in miles using Haversine formula. */
export function haversineDistanceMiles(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 3958.8; // Earth radius miles
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
    Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
