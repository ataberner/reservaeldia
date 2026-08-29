import {
  Html,
  Body,
  Container,
  Heading,
  Text,
} from "react-email";

export function TestEmail() {
  return (
    <Html lang="es">
      <Body
        style={{
          fontFamily: "Arial, sans-serif",
          backgroundColor: "#f5f5f5",
          padding: "40px",
        }}
      >
        <Container
          style={{
            backgroundColor: "#ffffff",
            padding: "32px",
          }}
        >
          <Heading>
            Reserva el Día
          </Heading>

          <Text>
            Este es el primer email enviado desde
            Reserva el Día utilizando React Email y
            Amazon SES.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}