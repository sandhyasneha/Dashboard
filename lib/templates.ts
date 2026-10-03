// Starter email sequences. Everything here is a starting point: edit any word in the builder, or press Write with AI.
// A paragraph that is only a link becomes an orange button. Keep dates and claims true before you send.

export type TemplateStep = { subject: string; body_md: string; delay_days: number };
export type EmailTemplate = { id: string; name: string; description: string; steps: TemplateStep[] };

const LINK = "https://trucktaxpro.com";

export const TEMPLATES: EmailTemplate[] = [
  {
    id: "due-date", name: "2290 filing due date",
    description: "A reminder that the Form 2290 deadline is near, with two short follow-ups.",
    steps: [
      { subject: "Your Form 2290 due date is coming up", delay_days: 0,
        body_md: `Hi there,\n\nIf you run a truck with a taxable gross weight of 55,000 pounds or more, your Form 2290 (the Heavy Highway Vehicle Use Tax return) is due by the last day of the month after you first put the vehicle on the road. For trucks already in service on July 1, that date is August 31.\n\nFiling late can mean IRS penalties and interest, and your state may not renew your registration without the stamped Schedule 1.\n\n[File Form 2290 now](${LINK})\n\nIf you have already filed, thank you, and you can ignore this email. Reply here if you have a question.` },
      { subject: "Re: Your Form 2290 due date", delay_days: 4,
        body_md: `Hi there,\n\nA quick follow-up in case my last note got buried.\n\nIf you have not filed yet, you can start here. Have your VINs, the gross weight and the month each vehicle was first used ready.\n\n[File Form 2290](${LINK})\n\nReply to this email any time if you need help.` },
      { subject: "Last reminder about your Form 2290", delay_days: 7,
        body_md: `Hi there,\n\nThis is my last message on this. The longer a return is late, the more penalty and interest can build up.\n\n[File Form 2290 now](${LINK})\n\nEither way, safe travels out there.` },
    ],
  },
  {
    id: "prefile", name: "Prefile 2290 starts now",
    description: "Tells customers they can file early for the coming tax period. Send it only once prefiling has opened.",
    steps: [
      { subject: "Prefile your Form 2290 now", delay_days: 0,
        body_md: `Hi there,\n\nPrefiling for Form 2290 is open. That means you can file your return for the coming tax period before it begins and have your stamped Schedule 1 in hand early.\n\nGetting it done now takes one more thing off your list when registration renewal comes around.\n\n[Prefile Form 2290 now](${LINK})\n\nReply to this email if you have any questions.` },
      { subject: "Reminder: prefile your Form 2290", delay_days: 5,
        body_md: `Hi there,\n\nJust a reminder that you can prefile your Form 2290 for the coming tax period now.\n\n[Prefile Form 2290](${LINK})\n\nIf you have already filed, you can ignore this email.` },
    ],
  },
  {
    id: "accepting-2027-28", name: "We accept 2290 for TY2027-28",
    description: "Announces that you are accepting returns for the 2027-28 tax period (July 1, 2027 to June 30, 2028).",
    steps: [
      { subject: "We're accepting Form 2290 for the 2027-28 tax period", delay_days: 0,
        body_md: `Hi there,\n\nTruckTaxPro is now accepting Form 2290 returns for the 2027-28 tax period (July 1, 2027 to June 30, 2028).\n\nIf you have vehicles with a taxable gross weight of 55,000 pounds or more, you can file with us now and have your stamped Schedule 1 ready for registration.\n\n[File for 2027-28](${LINK})\n\nQuestions? Just reply to this email.` },
      { subject: "Reminder: Form 2290 for 2027-28", delay_days: 6,
        body_md: `Hi there,\n\nA quick reminder that we are accepting Form 2290 for the 2027-28 tax period.\n\n[File Form 2290](${LINK})\n\nIf you have already filed, thank you.` },
    ],
  },
  {
    id: "blank", name: "Blank email", description: "Start from nothing and write it yourself, or with AI.",
    steps: [{ subject: "", body_md: "", delay_days: 0 }],
  },
];
