"use client";
import { useEffect, useRef, useState } from "react";

/** Full-window drop target (design/components/drop/DropZone). Shows a dashed 9:16 ghost while a file is over the window. */
export function DropZone({ onDrop, label = "drop to start an edit" }: { onDrop: (f: File) => void; label?: string }) {
  const [on, setOn] = useState(false);
  const depth = useRef(0);
  useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");
    const enter = (e: DragEvent) => {
      if (hasFiles(e)) {
        depth.current++;
        setOn(true);
      }
    };
    const leave = () => {
      depth.current = Math.max(0, depth.current - 1);
      if (!depth.current) setOn(false);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setOn(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) onDrop(f);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [onDrop]);
  return (
    <div className={"el-drop" + (on ? " is-on" : "")} aria-hidden={!on}>
      <div className="el-drop__ring">{label}</div>
    </div>
  );
}
