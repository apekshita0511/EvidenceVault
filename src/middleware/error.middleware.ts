import type { NextFunction, Request, Response } from "express";
import multer from "multer";

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ success: false, message: "Not found" });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof multer.MulterError) {
    const tooBig = err.code === "LIMIT_FILE_SIZE";
    return res
      .status(tooBig ? 413 : 400)
      .json({ success: false, message: tooBig ? "File exceeds the size limit" : `Upload error: ${err.code}` });
  }
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({ success: false, message: "Malformed JSON body" });
  }
  // Log the message only: never request bodies, tokens or file contents.
  console.error("Unhandled error:", err instanceof Error ? err.message : "unknown error");
  res.status(500).json({ success: false, message: "Internal server error" });
}
