// Aviso cuando el estudio no tiene pagos online: los bonos se compran en el
// estudio. Muestra los datos de contacto que haya en la config.
import { Box, Flex, Text } from '@chakra-ui/react';
import { Icon, type IconName } from './ui/Icon';
import { useLangStore } from './stores/lang.store';
import { addressLine, mapsUrl, phoneHref, useSite, whatsappUrl } from '../lib/site';

interface Props {
  /** 'guest' = invitada sin cuenta (necesita cuenta + créditos para reservar). */
  variant?: 'default' | 'guest';
}

export default function PaymentsDisabledNotice({ variant = 'default' }: Props) {
  const site = useSite();
  const en = useLangStore((s) => s.lang) === 'en';
  const wa = whatsappUrl(site);
  const tel = phoneHref(site);
  const address = addressLine(site);
  const links = [
    wa && { icon: 'whatsapp', label: site.contact.phone || 'WhatsApp', href: wa },
    !wa && tel && { icon: 'phone', label: site.contact.phone, href: tel },
    site.contact.email && { icon: 'mail', label: site.contact.email, href: `mailto:${site.contact.email}` },
    address && { icon: 'map-pin', label: address, href: mapsUrl(site) },
  ].filter(Boolean) as { icon: IconName; label: string; href: string }[];

  const title = en ? 'Buy your class packs at the studio' : 'Compra tus bonos directamente en el estudio';
  const body = variant === 'guest'
    ? (en
      ? `Online card payments aren't available at ${site.studio_name}. Create an account and buy your credits at the studio: then you can book online with them.`
      : `${site.studio_name} no tiene pago online con tarjeta. Crea tu cuenta y compra tus créditos en el estudio: después podrás reservar online con ellos.`)
    : (en
      ? `Online card payments aren't available at ${site.studio_name}. Ask at the studio and we'll add the credits to your account; then you can book online.`
      : `${site.studio_name} no tiene pago online con tarjeta. Pídelos en el estudio y te los añadimos a tu cuenta; después podrás reservar online.`);

  return (
    <Box role="status" textAlign="center" py={2}>
      <Flex w="56px" h="56px" borderRadius="full" mx="auto" mb={3} align="center" justify="center"
        bg="var(--accent-soft)">
        <Icon name="store" size={22} color="var(--accent)" />
      </Flex>
      <Text fontFamily="var(--font-heading)" fontSize="2xl" color="var(--heading-color)" letterSpacing="0.03em" mb={2}>
        {title}
      </Text>
      <Text fontFamily="var(--font-body)" fontSize="sm" color="var(--text-muted)"
        lineHeight="1.6" maxW="440px" mx="auto" mb={links.length ? 4 : 0}>
        {body}
      </Text>
      {links.length > 0 && (
        <Flex direction="column" gap={2} align="center">
          {links.map(({ icon, label, href }) => (
            <Box key={href} as="a" href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer"
              display="inline-flex" alignItems="center" gap={2} textTransform="none"
              fontFamily="var(--font-body)" fontWeight={600} fontSize="sm" color="var(--page-text)"
              _hover={{ color: 'var(--accent-text)' }}>
              <Icon name={icon} size={14} color="var(--accent)" />
              {label}
            </Box>
          ))}
        </Flex>
      )}
    </Box>
  );
}
