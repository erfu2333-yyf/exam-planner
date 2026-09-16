import { useState } from "react";
import { profileNeedsPass, type Profile } from "../workspace";
import { Button, TextField } from "./ui";

export function WorkspaceGate({
  profiles,
  cloudAvailable,
  cloudMessage,
  onCreate,
  onUnlock,
}: {
  profiles: Profile[];
  cloudAvailable: boolean;
  cloudMessage?: string;
  onCreate: (name: string, passphrase: string) => Promise<void>;
  onUnlock: (id: string, passphrase: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [picked, setPicked] = useState<string | null>(profiles[0]?.id ?? null);
  const [unlockPass, setUnlockPass] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const pickedProfile = profiles.find((item) => item.id === picked) ?? null;
  const needPass = pickedProfile ? profileNeedsPass(pickedProfile) : false;

  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : "没打开");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 520, margin: "12vh auto", padding: "0 16px" }}>
      <div className="panel stack" style={{ gap: 16 }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>备考排程器</div>
          <div className="muted" style={{ marginTop: 6 }}>
            {cloudAvailable
              ? "用户名 + 口令打开自己的计划。换手机也能用同一份。"
              : "用户名 + 口令打开自己的计划。先存在这台浏览器里。"}
          </div>
          {cloudMessage ? (
            <div className="small" style={{ color: "var(--danger)", marginTop: 8 }}>
              {cloudMessage}
            </div>
          ) : null}
        </div>
        {cloudAvailable ? (
          <div className="stack" style={{ gap: 8 }}>
            <TextField value={name} placeholder="用户名" onChange={setName} />
            <TextField
              type="password"
              autoComplete="current-password"
              value={pass}
              placeholder="口令，至少 4 个字符"
              onChange={setPass}
            />
            <TextField
              type="password"
              autoComplete="new-password"
              value={confirm}
              placeholder="注册时再输一次口令"
              onChange={setConfirm}
            />
            <div className="row" style={{ gap: 8 }}>
              <Button
                variant="primary"
                disabled={!name.trim() || !pass || busy}
                onClick={() => run(() => onUnlock(name.trim(), pass))}
              >
                登录
              </Button>
              <Button
                disabled={!name.trim() || busy}
                onClick={() =>
                  run(async () => {
                    if (pass !== confirm) throw new Error("两次口令不一致");
                    await onCreate(name.trim(), pass);
                  })
                }
              >
                注册
              </Button>
            </div>
            <div className="small muted-3">
              第一次用请点注册。这台电脑里已有计划、用户名又对得上的话，会一并上传。
            </div>
          </div>
        ) : (
          <>
            {profiles.length > 0 ? (
              <div className="stack" style={{ gap: 8 }}>
                <strong>打开本机已有计划</strong>
                {profiles.map((profile) => (
                  <button
                    key={profile.id}
                    type="button"
                    className={picked === profile.id ? "btn btn-primary" : "btn"}
                    onClick={() => {
                      setPicked(profile.id);
                      setUnlockPass("");
                      setError("");
                    }}
                    style={{ justifyContent: "space-between" }}
                  >
                    <span>{profile.name}</span>
                    <span className="small" style={{ opacity: 0.8 }}>
                      {profileNeedsPass(profile) ? "有口令" : "尚未设口令"}
                    </span>
                  </button>
                ))}
                {pickedProfile && needPass ? (
                  <TextField
                    type="password"
                    value={unlockPass}
                    placeholder="口令"
                    onChange={setUnlockPass}
                  />
                ) : null}
                <Button
                  variant="primary"
                  disabled={!pickedProfile || busy}
                  onClick={() =>
                    run(() => onUnlock(pickedProfile!.id, needPass ? unlockPass : ""))
                  }
                >
                  进入
                </Button>
              </div>
            ) : null}
            <div className="stack" style={{ gap: 8 }}>
              <strong>新建我的计划</strong>
              <TextField value={name} placeholder="用户名，比如 小王" onChange={setName} />
              <TextField
                type="password"
                autoComplete="new-password"
                value={pass}
                placeholder="口令，至少 4 个字符"
                onChange={setPass}
              />
              <TextField
                type="password"
                autoComplete="new-password"
                value={confirm}
                placeholder="再输一次口令"
                onChange={setConfirm}
              />
              <Button
                variant="primary"
                disabled={!name.trim() || busy}
                onClick={() =>
                  run(async () => {
                    if (pass !== confirm) throw new Error("两次口令不一致");
                    await onCreate(name.trim(), pass);
                  })
                }
              >
                开始我的计划
              </Button>
              <div className="small muted-3">
                会从一份考研模板开始。口令只用来在这台设备上认人。
              </div>
            </div>
          </>
        )}
        {error ? (
          <div className="small" style={{ color: "var(--danger)" }}>
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}
