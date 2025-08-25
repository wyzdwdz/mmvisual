// Copyright 2025 wyzdwdz <wyzdwdz@gmail.com>
//
// Licensed under the MIT license <LICENSE or https://opensource.org/licenses/MIT>.
// This file may not be copied, modified, or distributed except according to
// those terms.

import { FormControlLabel, Switch } from "@mui/material";
import { red } from "@mui/material/colors";
import { alpha, styled } from "@mui/material/styles";
import { Application, extend, useApplication } from "@pixi/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { throttle } from "lodash";
import mime from "mime";
import { Container, Graphics, Sprite, BitmapText, TextStyle, Texture } from "pixi.js";
import { useEffect, useRef, useState } from "react";
import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import "./App.css";
import { event } from "@tauri-apps/api";

const GLOBAL_SCALE = 60;

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

const RedSwitch = styled(Switch)(({ theme }) => ({
  "& .MuiSwitch-switchBase.Mui-checked": {
    color: red[800],
    "&:hover": {
      backgroundColor: alpha(red[800], theme.palette.action.hoverOpacity),
    },
  },
  "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
    backgroundColor: red[800],
  },
}));

extend({
  Container,
  Sprite,
  Graphics,
  BitmapText,
});

function SensorMarker({
  x,
  y,
  q,
  is_hedge,
  container_scale,
}: {
  x: number;
  y: number;
  q: number;
  is_hedge: boolean;
  container_scale: number;
}) {
  const [keyScale, setKeyScale] = useState(1);

  const textStyle = new TextStyle({
    fontFamily: "Roboto",
    fontSize: 20,
  });

  const text = "x: " + x.toFixed(2) + "\ny: " + y.toFixed(2) + "\nq: " + q;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();

      if (event.key == "-") {
        console.log(keyScale);
        setKeyScale((scale) => scale - 0.1);
      } else if (event.key == "+") {
        console.log(keyScale);
        setKeyScale((scale) => scale + 0.1);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    }
  }, []);

  return (
    <pixiContainer
      x={x * GLOBAL_SCALE}
      y={-y * GLOBAL_SCALE}
      scale={1 / container_scale * keyScale}
    >
      <pixiGraphics
        draw={(graphics) => {
          graphics.clear();
          graphics.setFillStyle({ color: is_hedge ? "red" : "blue" });
          graphics.circle(0, 0, 8);
          graphics.fill();
        }}
      />
      {is_hedge && <pixiBitmapText x={-70} y={-70} style={textStyle} text={text} />}
    </pixiContainer>
  );
}

function FloorPlan({
  x,
  y,
  scale_pixels_per_m,
  data,
  ext,
}: {
  x: number;
  y: number;
  scale_pixels_per_m: number;
  data: Uint8Array;
  ext: string;
}) {
  const [texture, setTexture] = useState(Texture.EMPTY);

  useEffect(() => {
    if (!data?.length) return;

    const mime_type = mime.getType(ext);
    if (!mime_type) return;

    const createImage = async () => {
      const buffer = data instanceof Uint8Array ? data : new Uint8Array(data);
      const blob = new Blob([buffer], { type: mime_type });
      const imageUrl = URL.createObjectURL(blob);

      const img = new Image();

      try {
        img.src = imageUrl;
        await img.decode();

        const texture = Texture.from(img);
        setTexture(texture);
      } catch (error) {
        console.error("Image loading failed", error);
      } finally {
        URL.revokeObjectURL(imageUrl);
      }

      return () => {
        URL.revokeObjectURL(img.src);
      };
    };

    createImage();
  }, [data, ext]);

  return (
    <>
      {texture !== Texture.EMPTY && (
        <pixiSprite
          x={x * GLOBAL_SCALE}
          y={y * GLOBAL_SCALE}
          width={(texture.width / scale_pixels_per_m) * GLOBAL_SCALE}
          height={(texture.height / scale_pixels_per_m) * GLOBAL_SCALE}
          texture={texture}
        />
      )}
    </>
  );
}

function PixiContainer({ devices, plan }: { devices: Device[]; plan: Plan }) {
  const { app } = useApplication();

  const refContainer = useRef<Container>(null);
  const isDraggingRef = useRef(false);

  const [mouseScale, setMouseScale] = useState(1);

  useEffect(() => {
    const onDragStart = (event: MouseEvent) => {
      event.preventDefault();

      if (event.button !== 0) return;
      isDraggingRef.current = true;
    };

    const onDragMove = (event: MouseEvent) => {
      event.preventDefault();

      if (event.button !== 0 || !refContainer.current) return;

      if (!isDraggingRef.current) return;

      const container = refContainer.current;

      container.x = container.x + event.movementX;
      container.y = container.y + event.movementY;
    };

    const onDragEnd = (event: MouseEvent) => {
      event.preventDefault();

      if (event.button !== 0) return;
      isDraggingRef.current = false;
    };

    app.canvas.addEventListener("mousedown", onDragStart);
    window.addEventListener("mousemove", onDragMove);
    window.addEventListener("mouseup", onDragEnd);

    return () => {
      app.canvas.removeEventListener("mousedown", onDragStart);
      window.removeEventListener("mousemove", onDragMove);
      window.removeEventListener("mouseup", onDragEnd);
    };
  }, []);

  useEffect(() => {
    if (!refContainer.current) return;
    const container = refContainer.current;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      const scaleBy = 1.15;
      const pointerX = e.x - app.screen.x;
      const pointerY = e.y - app.screen.y;

      requestAnimationFrame(() => {
        const oldScale = container.scale.x;
        const newScale = Math.max(
          Math.min(e.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy, 10),
          0.1,
        );

        container.x =
          pointerX - ((pointerX - container.x) * newScale) / oldScale;
        container.y =
          pointerY - ((pointerY - container.y) * newScale) / oldScale;
        container.scale = newScale;

        setMouseScale(newScale);
      });
    };

    const throttledWheel = throttle(handleWheel, 50, {
      leading: true,
      trailing: false,
    });

    app.canvas.addEventListener("wheel", throttledWheel, { passive: false });

    return () => {
      app.canvas.removeEventListener("wheel", throttledWheel);
    };
  }, []);

  return (
    <pixiContainer
      x={app.screen.width / 2}
      y={app.screen.height / 2}
      ref={refContainer}
    >
      <FloorPlan
        x={plan.x}
        y={-plan.y}
        scale_pixels_per_m={plan.scale_pixels_per_m}
        data={plan.data}
        ext={plan.ext}
      />
      {devices.map((device) => (
        <SensorMarker
          key={`${device.address}-${device.x.toFixed(2)}-${device.y.toFixed(2)}`}
          container_scale={mouseScale}
          {...device}
        />
      ))}
    </pixiContainer>
  );
}

export default function App() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);

  useEffect(() => {
    const unlisten = listen<string>("log-message", (event) => {
      console.log(`Log: ${event.payload}`);
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type !== "drop") {
        return;
      }

      if (!event.payload.paths[0]) {
        return;
      }

      invoke<[Device[], Plan | null]>("parse_map", {
        path: event.payload.paths[0],
      }).then(([tr_devices, tr_plan]) => {
        setDevices(tr_devices);
        setPlan(tr_plan);
      });

      invoke("mmstart");
    });

    return () => {
      unlisten.then();
    };
  }, []);

  useEffect(() => {
    const intervalId = setInterval(() => {
      invoke<Device[]>("read_devices").then((tr_devices) => {
        setDevices((prevDevices) => {
          const newDevices = [...prevDevices];
          let hasChanged = false;

          tr_devices.forEach((tr_device) => {
            if (tr_device.q < 50) return;

            const index = prevDevices.findIndex(
              (d) => d.address === tr_device.address,
            );

            if (index !== -1) {
              const existing = prevDevices[index];

              const deviceChanged =
                Math.abs(existing.x - tr_device.x) > 0.01 ||
                Math.abs(existing.y - tr_device.y) > 0.01 ||
                existing.q !== tr_device.q ||
                existing.is_hedge !== tr_device.is_hedge;
              if (deviceChanged) {
                newDevices[index] = tr_device;
                hasChanged = true;
              }
            } else {
              newDevices.push(tr_device);
              hasChanged = true;
            }
          });

          return hasChanged ? newDevices : prevDevices;
        });
      });
    }, 10);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  const changeRecord = (_event: React.SyntheticEvent, checked: boolean) => {
    if (checked) {
      invoke("start_record");
    } else {
      invoke("stop_record");
    }
  };

  return (
    <>
      {devices.length > 0 && plan && (
        <Application
          background={"#ffffffff"}
          resizeTo={window}
          antialias={true}
          autoDensity={true}
          resolution={window.devicePixelRatio}
        >
          <PixiContainer devices={devices} plan={plan} />
        </Application>
      )}
      <div
        style={{
          position: "absolute",
          top: "20px",
          right: "20px",
          zIndex: 10,
        }}
      >
        <FormControlLabel
          control={<RedSwitch />}
          label="Record"
          onChange={changeRecord}
        />
      </div>
    </>
  );
}
