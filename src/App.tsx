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
import Konva from "konva";
import { throttle } from "lodash";
import { SyntheticEvent, useEffect, useRef, useState } from "react";
import { Circle, Group, Image, Layer, Stage, Text } from "react-konva";
import { Html } from "react-konva-utils";
import useImage from "use-image";
import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import "./App.css";

const floorPlan_scene1 = {
  x: -7.136,
  y: 8.429,
  scale_pixels_per_m: 54.112,
  path: "./S2 FL2 map.jpg",
};
const devicesInit_scene1 = Array<Device>(
  {
    address: 1,
    is_hedge: false,
    x: 0.003,
    y: 0,
    q: 0,
  },
  {
    address: 2,
    is_hedge: false,
    x: 3.43,
    y: 0,
    q: 0,
  },
  {
    address: 3,
    is_hedge: false,
    x: -0.07,
    y: -5.63,
    q: 0,
  },
  {
    address: 5,
    is_hedge: false,
    x: -0.07,
    y: -1.506,
    q: 0,
  },
);

interface Device {
  address: number;
  is_hedge: boolean;
  x: number;
  y: number;
  q: number;
}

const floorPlan_scene2 = {
  x: -20.934,
  y: 11.246,
  scale_pixels_per_m: 120.971,
  path: "./FL2O.jpg",
};
const devicesInit_scene2 = Array<Device>(
  {
    address: 1,
    is_hedge: false,
    x: 0,
    y: 0,
    q: 0,
  },
  {
    address: 2,
    is_hedge: false,
    x: -7.813,
    y: 0.408,
    q: 0,
  },
  {
    address: 3,
    is_hedge: false,
    x: 4.906,
    y: -5.470,
    q: 0,
  },
  {
    address: 5,
    is_hedge: false,
    x: 5.05,
    y: -1.37,
    q: 0,
  },
);

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
}: {
  x: number;
  y: number;
  scale_pixels_per_m: number;
}) {
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);

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

  const handleMenuClose = () => {
    setContextMenu(null);
  };

  const [planImage] = useImage(floorPlan_scene2.path);
  if (!planImage) return;

  return (
    <>
      <Image
        x={x}
        y={y}
        width={planImage.width / scale_pixels_per_m}
        height={planImage.height / scale_pixels_per_m}
        image={planImage}
        onContextMenu={handleContextMenu}
      />
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

function VisualStage({ devices }: { devices: Device[] }) {
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

    const handleWheel = throttle((e: WheelEvent) => {
      e.preventDefault();
      const scaleBy = 1.1;
      const oldScale = stage.scaleX();
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const newScale = Math.max(
        Math.min(e.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy, 150),
        10,
      );

      stage.position({
        x: pointer.x - ((pointer.x - stage.x()) * newScale) / oldScale,
        y: pointer.y - ((pointer.y - stage.y()) * newScale) / oldScale,
      });
      stage.scaleX(newScale);
      stage.scaleY(newScale);
    }, 100);

    document.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      document.removeEventListener("wheel", handleWheel);
    };
  });

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
          x={floorPlan_scene2.x}
          y={-floorPlan_scene2.y}
          scale_pixels_per_m={floorPlan_scene2.scale_pixels_per_m}
        />
        {devices.map((device) => (
          <SensorMarker
            key={device.address}
            x={device.x}
            y={device.y}
            q={device.q}
            is_hedge={device.is_hedge}
          />
        ))}
      </Layer>
    </Stage>
  );
}

export default function App() {
  const devicesInit = devicesInit_scene2;
  const [devices, setDevices] = useState<Device[]>(devicesInit);

  useEffect(() => {
    const unlisten = listen<string>("log-message", (event) => {
      console.log(`Log: ${event.payload}`);
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  useEffect(() => {
    invoke("mmstart");
  }, []);

  useEffect(() => {
    setInterval(() => {
      invoke<Device[]>("read_devices").then((tr_devices) => {
        setDevices((prevDevices) => {
          const newDevices = [...prevDevices];
          tr_devices.forEach((tr_device) => {
            if (tr_device.q < 50) return;

            const existingIndex = newDevices.findIndex(
              (d) => d.address === tr_device.address,
            );

            if (existingIndex !== -1) {
              newDevices[existingIndex] = {
                ...newDevices[existingIndex],
                is_hedge: tr_device.is_hedge,
                x: tr_device.x,
                y: tr_device.y,
                q: tr_device.q,
              };
            } else {
              newDevices.push({ ...tr_device });
              console.log("Added new device", tr_device.address);
            }
          });
          return newDevices;
        });
      });
    }, 10);
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
      <VisualStage devices={devices} />
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
