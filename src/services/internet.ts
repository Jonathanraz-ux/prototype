import type { InternetStatus, ConnectionState, DisconnectReason } from "../types";

let internetStatus: InternetStatus = "cut";
let listeners: Array<(status: InternetStatus) => void> = [];

export const InternetService = {
  getStatus(): InternetStatus {
    return internetStatus;
  },

  setStatus(status: InternetStatus) {
    internetStatus = status;
    listeners.forEach((fn) => fn(status));
  },

  activate() {
    internetStatus = "active";
    listeners.forEach((fn) => fn("active"));
  },

  cut() {
    internetStatus = "cut";
    listeners.forEach((fn) => fn("cut"));
  },

  suspend() {
    internetStatus = "suspended";
    listeners.forEach((fn) => fn("suspended"));
  },

  onStatusChange(listener: (status: InternetStatus) => void) {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((fn) => fn !== listener);
    };
  },

  getConnectionStateFromStatus(): ConnectionState {
    switch (internetStatus) {
      case "active": return "connected";
      case "cut": return "deconnected";
      case "suspended": return "suspended";
    }
  },

  getDisconnectReason(): DisconnectReason | undefined {
    if (internetStatus === "cut") return "network_error";
    if (internetStatus === "suspended") return "suspended";
    return undefined;
  }
};
