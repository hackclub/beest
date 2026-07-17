/**
 * Block Kit templates for builder DM notifications. Ported from the
 * "Beest Crabby" relay, with reviewer impersonation removed. Messages are
 * sent from our own bot, and the reviewer name is shown as plain text only
 * when it isn't hidden (`reviewerName === null` → "A reviewer").
 */

export type DmMessage = { text: string; blocks: Record<string, unknown>[] };

interface ReviewDmInput {
  projectName: string;
  /** Link shown on the "View Project" button; omitted when null. */
  projectLink: string | null;
  /** Reviewer's display name, or null when hidden from the owner. */
  reviewerName: string | null;
  feedback: string | null;
  /** True when this approval marks the project golden — adds a callout. */
  isGolden?: boolean;
  /**
   * True when the builder already had another golden project before this one,
   * so the golden callout congratulates rather than explains the perks (which
   * they already have).
   */
  goldenAlreadyHad?: boolean;
}

// When the reviewer opts to stay anonymous (reviewerName === null) the DM
// speaks in the team's voice ("We reviewed…") rather than naming a reviewer.
function reviewerLabel(reviewerName: string | null): string {
  return reviewerName ? `*${reviewerName}*` : 'We';
}

function viewProjectButton(
  projectLink: string | null,
): Record<string, unknown>[] {
  if (!projectLink) return [];
  return [
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'View Project' },
          url: projectLink,
        },
      ],
    },
  ];
}

export function reviewApprovedDm(input: ReviewDmInput): DmMessage {
  const blocks: Record<string, unknown>[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: ':tada: Your project was approved!',
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${reviewerLabel(input.reviewerName)} reviewed your project *${input.projectName}* and approved it. Nice work!`,
      },
    },
  ];

  if (input.feedback) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Feedback:* ${input.feedback}` },
    });
  }

  // Called out on every approval that marks the project golden. First-time
  // golden earners get the perks explained; repeat earners (who already have
  // them) just get a cheer.
  if (input.isGolden) {
    const perk = input.goldenAlreadyHad
      ? 'Keep making cool projects! :cat-heart:'
      : 'You now have priority access in the review queue and access to the black market. :yay:';
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:woa: This project was marked *golden*! ${perk}`,
      },
    });
  }

  blocks.push(
    { type: 'divider' },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: 'Your project will be fraud-checked next, and your Pipes should arrive soon. :yay:',
        },
      ],
    },
    ...viewProjectButton(input.projectLink),
  );

  return { text: `Your project ${input.projectName} was approved`, blocks };
}

export function reviewChangesNeededDm(input: ReviewDmInput): DmMessage {
  const blocks: Record<string, unknown>[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: ':construction: Changes needed on your project',
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${reviewerLabel(input.reviewerName)} reviewed your project *${input.projectName}* and requested some changes.`,
      },
    },
  ];

  if (input.feedback) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Feedback:* ${input.feedback}` },
    });
  }

  blocks.push(
    { type: 'divider' },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: "Don't give up! Address the feedback and ship again.",
        },
      ],
    },
    ...viewProjectButton(input.projectLink),
  );

  return { text: `Changes needed on ${input.projectName}`, blocks };
}

// Permanent ("hard") rejection of a single project. Unlike changes_needed, the
// builder cannot resubmit THIS project — but they're free to ship other ones.
export function reviewRejectedDm(input: ReviewDmInput): DmMessage {
  const intro =
    `Hey - unfortunately your project *${input.projectName}* has been rejected by Beest. ` +
    `You're free to ship it to other Hack Club programs, or you can dispute this in the help channel. ` +
    `Currently you cannot resubmit this project as it doesn't meet our standards for submission` +
    (input.feedback ? ', the reason provided is as follows:' : '.');

  const blocks: Record<string, unknown>[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: ':no_entry: Your project was rejected',
        emoji: true,
      },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: intro },
    },
  ];

  if (input.feedback) {
    // Prefix every line so multi-line feedback stays inside the block quote.
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `>${input.feedback.replace(/\n/g, '\n>')}` },
    });
  }

  blocks.push(...viewProjectButton(input.projectLink));

  return { text: `Your project ${input.projectName} was rejected`, blocks };
}

export function shipSubmittedDm(input: {
  projectName: string;
  projectLink: string | null;
}): DmMessage {
  const nameMd = input.projectLink
    ? `<${input.projectLink}|*${input.projectName}*>`
    : `*${input.projectName}*`;
  return {
    text: `Your project ${input.projectName} was submitted for review`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: ':rocket: Project submitted for review',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Your project ${nameMd} has been submitted for review. We'll DM you here when a reviewer gets to it.`,
        },
      },
    ],
  };
}

interface OrderDmInput {
  orderId: string;
  itemName: string;
  quantity: number | string;
  /** Pre-formatted cost string, e.g. "5 Pipes". */
  cost: string;
}

function orderFields(input: OrderDmInput): Record<string, unknown>[] {
  return [
    { type: 'mrkdwn', text: `*Order ID:* ${input.orderId}` },
    { type: 'mrkdwn', text: `*Item:* ${input.itemName}` },
    { type: 'mrkdwn', text: `*Quantity:* ${input.quantity}` },
    { type: 'mrkdwn', text: `*Total:* ${input.cost}` },
  ];
}

export function orderPendingDm(input: OrderDmInput): DmMessage {
  return {
    text: `Order #${input.orderId} placed`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: ':shopping_trolley: Order placed',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: '*Your order status:* Pending' },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: '*Order details:*' },
        fields: orderFields(input),
      },
      { type: 'divider' },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: "Thanks for being a Beester! We'll DM you here when it ships.",
          },
        ],
      },
    ],
  };
}

export function orderFulfilledDm(input: OrderDmInput): DmMessage {
  return {
    text: `Order #${input.orderId} fulfilled`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: ':tada: Order fulfilled!',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Your order status:* Fulfilled and on its way to you!',
        },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: '*Order details:*' },
        fields: orderFields(input),
      },
      { type: 'divider' },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: 'Thank you for being a Beester!' },
        ],
      },
    ],
  };
}

// Sent by the cool-builder golden backfill: all of a trusted builder's
// projects were just marked golden in one sweep, unlocking the perks.
export function goldenBackfillDm(): DmMessage {
  return {
    text: "We've marked all of your projects as golden!",
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: ':woa: Your projects are now golden!',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: "Hiya! It looks like you've been making really cool projects, so we've marked all of them as golden. You now have priority access in the review queue and access to the black market!",
        },
      },
    ],
  };
}

export function fraudClearedDm(input: {
  projectName: string;
  projectLink: string | null;
}): DmMessage {
  const blocks: Record<string, unknown>[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: ':white_check_mark: Your project cleared review',
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Your project *${input.projectName}* passed final review, and your Pipes have been added to your balance. :yay:`,
      },
    },
    ...viewProjectButton(input.projectLink),
  ];
  return { text: `${input.projectName} cleared review`, blocks };
}
