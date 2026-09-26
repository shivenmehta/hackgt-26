"use client";

import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import type { ReactNode } from "react";

export function Provider({ children }: { children: ReactNode }) {
  return <ChakraProvider value={defaultSystem}>{children}</ChakraProvider>;
}
