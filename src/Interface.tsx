interface Plan {
  x: number;
  y: number;
  scale_pixels_per_m: number;
  data: Uint8Array;
  ext: string;
}

interface Device {
  address: number;
  is_hedge: boolean;
  x: number;
  y: number;
  q: number;
}

export type { Plan, Device };
