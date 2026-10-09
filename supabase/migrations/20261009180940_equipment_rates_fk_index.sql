-- Covers the equipment_rates -> equipment foreign key.
create index equipment_rates_company_equipment_idx
  on public.equipment_rates (company_id, equipment_id);
