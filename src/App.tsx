import { FormControlLabel, Switch } from "@mui/material";
import { red } from "@mui/material/colors";
import { alpha, styled } from "@mui/material/styles";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import Konva from "konva";
import { SyntheticEvent, useEffect, useRef, useState } from "react";
import { Circle, Group, Image, Layer, Stage, Text } from "react-konva";
import useImage from "use-image";
import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import "./App.css";

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
  const [planImage] = useImage("./S2 FL2 map.jpg");
  if (!planImage) {
    return;
  }

  return (
    <Image
      x={x}
      y={y}
      width={planImage.width / scale_pixels_per_m}
      height={planImage.height / scale_pixels_per_m}
      image={planImage}
    />
  );
}

function VisualStage({ devices }: { devices: Device[] }) {
  const refStage = useRef<Konva.Stage>(null);
  const refLayer = useRef<Konva.Layer>(null);

  useEffect(() => {
    refLayer.current?.cache();
  }, []);

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
    if (!stage) {
      return;
    }

    const scale = stage.scaleX();

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const direction = e.deltaY > 0 ? -1 : 1;
      const newScale = Math.min(Math.max(scale + direction * 1, 10), 100);
      stage.scaleX(newScale);
      stage.scaleY(newScale);
    };

    document.addEventListener("wheel", handleWheel);
  });

  return (
    <Stage
      width={window.innerWidth}
      height={window.innerHeight}
      x={window.innerWidth / 2}
      y={window.innerHeight / 2}
      ref={refStage}
      scaleX={70}
      scaleY={70}
      draggable
    >
      <Layer>
        <FloorPlan x={-7.136} y={-8.429} scale_pixels_per_m={54.112} />
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
  const devicesInit = Array<Device>(
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
            if (tr_device.q < 50) {
              return;
            }

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

  const buttonStyle: React.CSSProperties = {
    position: "absolute",
    top: "20px",
    right: "20px",
    zIndex: 10,
  };

  const changeRecord = (_event: SyntheticEvent, checked: boolean) => {
    console.log("change record", checked);
  };

  return (
    <>
      <VisualStage devices={devices} />
      <div style={buttonStyle}>
        <FormControlLabel
          control={<RedSwitch />}
          label="Record"
          onChange={changeRecord}
        />
      </div>
    </>
  );
}
