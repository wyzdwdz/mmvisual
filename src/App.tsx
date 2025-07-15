// Copyright 2025 wyzdwdz <wyzdwdz@gmail.com>
//
// Licensed under the MIT license <LICENSE or https://opensource.org/licenses/MIT>.
// This file may not be copied, modified, or distributed except according to
// those terms.

import { FormControlLabel, Menu, MenuItem, Switch } from "@mui/material";
import { red } from "@mui/material/colors";
import { alpha, styled } from "@mui/material/styles";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import Konva from "konva";
import { throttle } from "lodash";
import mime from "mime";
import { SyntheticEvent, useEffect, useRef, useState } from "react";
import {
  Circle,
  Group,
  Image as KonvaImage,
  Layer,
  Stage,
  Text,
} from "react-konva";
import { Html } from "react-konva-utils";
import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import "./App.css";

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

function SensorMarker({
  x,
  y,
  q,
  is_hedge,
}: {
  x: number;
  y: number;
  q: number;
  is_hedge: boolean;
}) {
  const text = "x: " + x.toFixed(2) + "\ny: " + y.toFixed(2) + "\nq: " + q;
  return (
    <Group x={x} y={-y}>
      {is_hedge && (
        <Text
          x={-1}
          y={-0.75}
          fontSize={0.28}
          fontFamily="roboto"
          text={text}
        />
      )}
      <Circle x={0} y={0} radius={0.1} fill={is_hedge ? "red" : "blue"} />
    </Group>
  );
}

// shift_x_m = -7.136
// shift_y_m = 8.429
// scale_pixels_per_m = 54.112
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
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);

  const [planImage, setPlanImage] = useState<HTMLImageElement | null>(null);

  const handleContextMenu = (e: Konva.KonvaEventObject<PointerEvent>) => {
    e.evt.preventDefault();

    setContextMenu(
      contextMenu === null
        ? {
          mouseX: e.evt.clientX + 2,
          mouseY: e.evt.clientY - 6,
        }
        : null,
    );
  };

  useEffect(() => {
    if (!data?.length) return;

    const mime_type = mime.getType(ext);
    if (!mime_type) return;

    const createImage = async () => {
      const buffer = data instanceof Uint8Array ? data : new Uint8Array(data);
      const blob = new Blob([buffer], { type: mime_type });
      const imageUrl = URL.createObjectURL(blob);

      try {
        const img = new Image();
        img.src = imageUrl;
        await img.decode();

        setPlanImage(img);
      } catch (error) {
        console.error("Image loading failed", error);
      } finally {
        URL.revokeObjectURL(imageUrl);
      }
    };

    createImage();

    return () => {
      if (planImage) {
        URL.revokeObjectURL(planImage.src);
      }
    };
  }, [data, ext]);

  return (
    <>
      {planImage && (
        <KonvaImage
          x={x}
          y={y}
          width={planImage.width / scale_pixels_per_m}
          height={planImage.height / scale_pixels_per_m}
          image={planImage}
          onContextMenu={handleContextMenu}
        />
      )}
      {/* <Html>
        <Menu
          open={contextMenu !== null}
          onClose={handleMenuClose}
          anchorReference="anchorPosition"
          anchorPosition={
            contextMenu !== null
              ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
              : undefined
          }
          onContextMenu={(e) => e.preventDefault()}
          onMouseDownCapture={(e) => {
            if (e.button === 2) {
              handleMenuClose();
            }
          }}
          transitionDuration={0}
        >
          <MenuItem onClick={handleMenuClose}>Hello</MenuItem>
          <MenuItem onClick={handleMenuClose}>World</MenuItem>
        </Menu>
      </Html> */}
    </>
  );
}

function VisualStage({ devices, plan }: { devices: Device[]; plan: Plan }) {
  const refStage = useRef<Konva.Stage>(null);

  useEffect(() => {
    const stage = refStage.current;

    const handleResize = () => {
      stage?.setSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    const stage = refStage.current;
    if (!stage) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      const scaleBy = 1.1;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      requestAnimationFrame(() => {
        const oldScale = stage.scaleX();
        const newScale = Math.max(
          Math.min(e.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy, 150),
          10
        );

        stage.position({
          x: pointer.x - ((pointer.x - stage.x()) * newScale) / oldScale,
          y: pointer.y - ((pointer.y - stage.y()) * newScale) / oldScale,
        });
        stage.scale({ x: newScale, y: newScale });
        stage.batchDraw();
      });
    };

    const throttledWheel = throttle(handleWheel, 50, { leading: true, trailing: false });

    document.addEventListener("wheel", throttledWheel, { passive: false });

    return () => {
      document.removeEventListener("wheel", throttledWheel);
    };
  }, []);

  return (
    <Stage
      width={window.innerWidth}
      height={window.innerHeight}
      x={window.innerWidth / 2}
      y={window.innerHeight / 2}
      scaleX={70}
      scaleY={70}
      draggable
      ref={refStage}
    >
      <Layer>
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
            {...device}
          />
        ))}
      </Layer>
    </Stage>
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

              const deviceChanged = (
                Math.abs(existing.x - tr_device.x) > 0.01 ||
                Math.abs(existing.y - tr_device.y) > 0.01 ||
                existing.q !== tr_device.q ||
                existing.is_hedge !== tr_device.is_hedge
              );
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
    }
  }, []);

  const changeRecord = (_event: SyntheticEvent, checked: boolean) => {
    if (checked) {
      invoke("start_record");
    } else {
      invoke("stop_record");
    }
  };

  return (
    <>
      {devices.length > 0 && plan && (
        <VisualStage devices={devices} plan={plan} />
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
