import { useState } from "react";
import type { Profile } from "../workspace";
import { Button, TextField } from "./ui";

export function WorkspaceGate({
  profiles,
  onCreate,
  onOpen,
}: {
  profiles: Profile[];
  onCreate: (name: string) => void;
  onOpen: (id: string) => void;
}) {
  const [name, setName] = useState("");

  return (
    <div style={{ maxWidth: 520, margin: "12vh auto", padding: "0 16px" }}>
      <div className="panel stack" style={{ gap: 16 }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>备考排程器</div>
          <div className="muted" style={{ marginTop: 6 }}>
            每人在这台浏览器里各有一份计划。同学改他们自己的，不会改到你的。
          </div>
        </div>
        {profiles.length > 0 ? (
          <div className="stack" style={{ gap: 8 }}>
            <strong>打开本机已有计划</strong>
            {profiles.map((profile) => (
              <Button key={profile.id} onClick={() => onOpen(profile.id)}>
                {profile.name}
              </Button>
            ))}
          </div>
        ) : null}
        <div className="stack" style={{ gap: 8 }}>
          <strong>新建我的计划</strong>
          <TextField
            value={name}
            placeholder="你的名字，比如 小王"
            onChange={setName}
          />
          <Button
            variant="primary"
            disabled={!name.trim()}
            onClick={() => onCreate(name.trim())}
          >
            开始我的计划
          </Button>
          <div className="small muted-3">
            会从一份考研模板开始，之后改动只存在这台设备的这个名字下。
          </div>
        </div>
      </div>
    </div>
  );
}
