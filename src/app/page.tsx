import { Container, Heading, Stack, Text } from "@chakra-ui/react";

export default function Home() {
  return (
    <Container as="main" maxW="3xl" py="20" px="6">
      <Stack gap="4">
        <Heading as="h1" size="3xl">
          HackGT 2026
        </Heading>
        <Text fontSize="lg">
          Helping people plan meals around their budget and the food they enjoy.
        </Text>
      </Stack>
    </Container>
  );
}
