import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Heading,
  Text,
} from "react-email";

export function TestEmail() {
  return (
    <Html lang="es">
      <Head />
      <Preview>Prueba de infraestructura con datos sintéticos.</Preview>
      <Body
        lang="es"
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

          <Text>Hola, María de Prueba.</Text>
          <Text>
            Este correo valida React Email y Amazon SES v2 en sandbox.
            Todos los datos son sintéticos: invitación de prueba, día 15 de
            septiembre y confirmación número 123.
          </Text>
          <Text>No corresponde a una compra, una cuenta ni una invitación real.</Text>
        </Container>
      </Body>
    </Html>
  );
}

export default TestEmail;
