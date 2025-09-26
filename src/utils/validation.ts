export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

export function validateEmailsList(emails: string[]): { valid: boolean; error?: string } {
  if (!emails || emails.length === 0) {
    return { valid: false, error: "Au moins une adresse email est requise" };
  }

  for (const email of emails) {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      return { valid: false, error: "Les adresses email ne peuvent pas être vides" };
    }
    
    if (!isValidEmail(trimmedEmail)) {
      return { valid: false, error: `L'adresse email "${trimmedEmail}" n'est pas valide` };
    }
  }

  // Check for duplicates
  const uniqueEmails = new Set(emails.map(email => email.trim().toLowerCase()));
  if (uniqueEmails.size !== emails.length) {
    return { valid: false, error: "Des adresses emails sont dupliquées" };
  }

  return { valid: true };
}