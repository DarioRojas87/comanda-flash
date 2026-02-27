import L from 'leaflet'

/** One color per delivery driver, assigned by array index */
export const DELIVERY_COLORS = [
  '#f97316',
  '#3b82f6',
  '#22c55e',
  '#a855f7',
  '#ef4444',
  '#eab308',
  '#ec4899'
]

/** Colored circular SVG icon for a delivery driver marker */
export const createDriverIcon = (color: string) =>
  new L.DivIcon({
    className: '',
    html: `<div style="
      width:32px;height:32px;
      background:${color};
      border:3px solid white;
      border-radius:50%;
      box-shadow:0 2px 8px rgba(0,0,0,0.35);
      display:flex;align-items:center;justify-content:center;
    ">
      <svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'>
        <circle cx='18.5' cy='17.5' r='3.5'/><circle cx='5.5' cy='17.5' r='3.5'/>
        <path d='M15 6a1 1 0 0 0 0-2h-1l-5 5H1m18.5 0H15'/>
        <path d='m6 17 3-9h5.5l2 5 2 4'/>
      </svg>
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18]
  })

/** Colored teardrop pin icon for an order destination marker */
export const createDestIcon = (color: string) =>
  new L.DivIcon({
    className: '',
    html: `<div style="position:relative;width:26px;height:38px;">
      <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 26 38' width='26' height='38'>
        <path d='M13 0C6 0 0 6 0 13c0 9.5 13 25 13 25S26 22.5 26 13C26 6 20 0 13 0z' fill='${color}' stroke='white' stroke-width='1.5'/>
        <circle cx='13' cy='13' r='5' fill='white' opacity='0.9'/>
      </svg>
    </div>`,
    iconSize: [26, 38],
    iconAnchor: [13, 38],
    popupAnchor: [0, -40]
  })
