import React from "react";

function createHost(name: string) {
  return React.forwardRef<any, any>((props, ref) =>
    React.createElement(name, { ...props, ref }, props.children)
  );
}

const View = createHost("View");
const Text = createHost("Text");
const ScrollView = createHost("ScrollView");
const KeyboardAvoidingView = createHost("KeyboardAvoidingView");
const ActivityIndicator = createHost("ActivityIndicator");
const Modal = createHost("Modal");
const RefreshControl = createHost("RefreshControl");

const TextInput = React.forwardRef<any, any>((props, ref) =>
  React.createElement("TextInput", { ...props, ref }, props.children)
);

const Pressable = React.forwardRef<any, any>(({ children, ...props }, ref) =>
  React.createElement(
    "Pressable",
    { ...props, ref },
    typeof children === "function" ? children({ pressed: false }) : children
  )
);

export const StyleSheet = {
  create: <T,>(styles: T) => styles,
  flatten: <T,>(style: T) => style
};

export const Animated = {
  Value: class {
    private value: number;
    constructor(value: number) {
      this.value = value;
    }
    interpolate() {
      return this.value;
    }
  },
  timing: () => ({
    start: (callback?: () => void) => callback?.()
  }),
  parallel: (animations: Array<{ start: (callback?: () => void) => void }>) => ({
    start: (callback?: () => void) => {
      animations.forEach((animation) => animation.start());
      callback?.();
    }
  }),
  View: createHost("AnimatedView")
};

export const Easing = {
  out: (value: unknown) => value,
  cubic: "cubic"
};

export const Alert = {
  alert: jest.fn()
};

export const Linking = {
  openSettings: jest.fn(async () => undefined),
  getInitialURL: jest.fn(async () => null),
  addEventListener: jest.fn(() => ({ remove: jest.fn() }))
};

export const Dimensions = {
  get: jest.fn(() => ({ width: 390, height: 844 }))
};

export const Platform = {
  OS: "ios",
  select: (value: Record<string, unknown>) => value.ios ?? value.default
};

export {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View
};
