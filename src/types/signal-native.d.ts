declare module "@elizaos/signal-native" {
  export interface SignalProfile {
    uuid: string;
    phoneNumber?: string;
  }

  export interface SignalReceivedMessage {
    senderUuid?: string;
    text?: string;
    timestamp?: number;
    isQueueEmpty?: boolean;
  }

  export function getProfile(authDir: string): Promise<SignalProfile>;
  export function receiveMessages(
    authDir: string,
    onMessage: (message: SignalReceivedMessage) => void | Promise<void>,
  ): Promise<void>;
  export function stopReceiving(authDir: string): Promise<void>;
  export function sendMessage(
    authDir: string,
    recipient: string,
    text: string,
  ): Promise<void>;
  export function linkDevice(
    authDir: string,
    deviceName: string,
  ): Promise<string>;
  export function finishLink(authDir: string): Promise<void>;
}

declare module "@elizaai/signal-native" {
  export interface SignalProfile {
    uuid: string;
    phoneNumber?: string;
  }

  export interface SignalReceivedMessage {
    senderUuid?: string;
    text?: string;
    timestamp?: number;
    isQueueEmpty?: boolean;
  }

  export function getProfile(authDir: string): Promise<SignalProfile>;
  export function receiveMessages(
    authDir: string,
    onMessage: (message: SignalReceivedMessage) => void | Promise<void>,
  ): Promise<void>;
  export function stopReceiving(authDir: string): Promise<void>;
  export function sendMessage(
    authDir: string,
    recipient: string,
    text: string,
  ): Promise<void>;
  export function linkDevice(
    authDir: string,
    deviceName: string,
  ): Promise<string>;
  export function finishLink(authDir: string): Promise<void>;
}
