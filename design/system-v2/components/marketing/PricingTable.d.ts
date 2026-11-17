import * as React from 'react';
/**
 * Three tiers with a monthly/yearly segmented toggle and a student 50%-off switch. Only the featured tier is raised. ALL PRICES ARE PLACEHOLDERS and are labelled as such in the UI.
 * @startingPoint section="Marketing" subtitle="Pricing with yearly toggle + student discount" viewport="1100x620"
 */
export interface PricingTableProps {
  yearly?: boolean;
  student?: boolean;
  onChoose?: (tier: 'free' | 'creator' | 'studio') => void;
  style?: React.CSSProperties;
}
export declare function PricingTable(props: PricingTableProps): JSX.Element;
