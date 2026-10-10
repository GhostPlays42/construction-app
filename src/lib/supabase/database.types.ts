
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "certifications": {
                  Row: {
                    "company_id": string,"created_at": string,"employee_id": string,"expires_on": string | null,"id": string,"name": string,"updated_at": string
                  }
                  Insert: {
                    "company_id": string,"created_at"?: string,"employee_id": string,"expires_on"?: string | null,"id"?: string,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"employee_id"?: string,"expires_on"?: string | null,"id"?: string,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "certifications_company_id_employee_id_fkey"
      columns: ["company_id","employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"companies": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"status": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"cost_codes": {
                  Row: {
                    "code": string,"company_id": string,"created_at": string,"id": string,"is_active": boolean,"name": string,"sort_order": number,"updated_at": string
                  }
                  Insert: {
                    "code": string,"company_id": string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "code"?: string,"company_id"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cost_codes_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"daily_reports": {
                  Row: {
                    "company_id": string,"content": NonNullable<Json>,"finalized_at": string,"finalized_by": string,"id": string,"job_id": string,"pdf_path": string | null,"work_date": string
                  }
                  Insert: {
                    "company_id": string,"content": NonNullable<Json>,"finalized_at"?: string,"finalized_by": string,"id"?: string,"job_id": string,"pdf_path"?: string | null,"work_date": string
                  }
                  Update: {
                    "company_id"?: string,"content"?: NonNullable<Json>,"finalized_at"?: string,"finalized_by"?: string,"id"?: string,"job_id"?: string,"pdf_path"?: string | null,"work_date"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "daily_reports_company_id_finalized_by_fkey"
      columns: ["company_id","finalized_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "daily_reports_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "daily_reports_company_id_job_id_fkey"
      columns: ["company_id","job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"employee_rates": {
                  Row: {
                    "company_id": string,"employee_id": string,"hourly_rate": number,"updated_at": string
                  }
                  Insert: {
                    "company_id": string,"employee_id": string,"hourly_rate": number,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"employee_id"?: string,"hourly_rate"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "employee_rates_company_id_employee_id_fkey"
      columns: ["company_id","employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"employees": {
                  Row: {
                    "company_id": string,"created_at": string,"email": string | null,"full_name": string,"id": string,"is_active": boolean,"phone": string | null,"role_key": string,"trade": string | null,"updated_at": string,"user_id": string | null
                  }
                  Insert: {
                    "company_id": string,"created_at"?: string,"email"?: string | null,"full_name": string,"id"?: string,"is_active"?: boolean,"phone"?: string | null,"role_key"?: string,"trade"?: string | null,"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"email"?: string | null,"full_name"?: string,"id"?: string,"is_active"?: boolean,"phone"?: string | null,"role_key"?: string,"trade"?: string | null,"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "employees_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "employees_role_key_fkey"
      columns: ["role_key"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["key"]
    }
                  ]
                },"equipment": {
                  Row: {
                    "company_id": string,"created_at": string,"down_for_repair": boolean,"equipment_type": string | null,"id": string,"is_active": boolean,"make": string | null,"model": string | null,"name": string,"ownership": string,"rental_company": string | null,"unit_number": string | null,"updated_at": string
                  }
                  Insert: {
                    "company_id": string,"created_at"?: string,"down_for_repair"?: boolean,"equipment_type"?: string | null,"id"?: string,"is_active"?: boolean,"make"?: string | null,"model"?: string | null,"name": string,"ownership"?: string,"rental_company"?: string | null,"unit_number"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"down_for_repair"?: boolean,"equipment_type"?: string | null,"id"?: string,"is_active"?: boolean,"make"?: string | null,"model"?: string | null,"name"?: string,"ownership"?: string,"rental_company"?: string | null,"unit_number"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "equipment_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"equipment_rates": {
                  Row: {
                    "company_id": string,"equipment_id": string,"hourly_rate": number,"updated_at": string
                  }
                  Insert: {
                    "company_id": string,"equipment_id": string,"hourly_rate": number,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"equipment_id"?: string,"hourly_rate"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "equipment_rates_company_id_equipment_id_fkey"
      columns: ["company_id","equipment_id"]
isOneToOne: false
      referencedRelation: "equipment"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"flha_hazards": {
                  Row: {
                    "company_id": string,"control": string,"flha_id": string,"hazard_id": string,"name": string,"position": number
                  }
                  Insert: {
                    "company_id": string,"control": string,"flha_id": string,"hazard_id": string,"name": string,"position": number
                  }
                  Update: {
                    "company_id"?: string,"control"?: string,"flha_id"?: string,"hazard_id"?: string,"name"?: string,"position"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "flha_hazards_company_id_flha_id_fkey"
      columns: ["company_id","flha_id"]
isOneToOne: false
      referencedRelation: "flhas"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "flha_hazards_company_id_hazard_id_fkey"
      columns: ["company_id","hazard_id"]
isOneToOne: false
      referencedRelation: "hazards"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"flha_ppe": {
                  Row: {
                    "company_id": string,"flha_id": string,"name": string,"position": number,"ppe_item_id": string
                  }
                  Insert: {
                    "company_id": string,"flha_id": string,"name": string,"position": number,"ppe_item_id": string
                  }
                  Update: {
                    "company_id"?: string,"flha_id"?: string,"name"?: string,"position"?: number,"ppe_item_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "flha_ppe_company_id_flha_id_fkey"
      columns: ["company_id","flha_id"]
isOneToOne: false
      referencedRelation: "flhas"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "flha_ppe_company_id_ppe_item_id_fkey"
      columns: ["company_id","ppe_item_id"]
isOneToOne: false
      referencedRelation: "ppe_items"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"flha_tasks": {
                  Row: {
                    "code": string,"company_id": string,"cost_code_id": string,"flha_id": string,"name": string,"position": number
                  }
                  Insert: {
                    "code": string,"company_id": string,"cost_code_id": string,"flha_id": string,"name": string,"position": number
                  }
                  Update: {
                    "code"?: string,"company_id"?: string,"cost_code_id"?: string,"flha_id"?: string,"name"?: string,"position"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "flha_tasks_company_id_cost_code_id_fkey"
      columns: ["company_id","cost_code_id"]
isOneToOne: false
      referencedRelation: "cost_codes"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "flha_tasks_company_id_flha_id_fkey"
      columns: ["company_id","flha_id"]
isOneToOne: false
      referencedRelation: "flhas"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"flhas": {
                  Row: {
                    "company_id": string,"employee_id": string,"filled_at": string,"id": string,"job_id": string,"other_control": string | null,"other_hazard": string | null,"signature": string,"submitted_at": string,"work_date": string
                  }
                  Insert: {
                    "company_id": string,"employee_id": string,"filled_at": string,"id": string,"job_id": string,"other_control"?: string | null,"other_hazard"?: string | null,"signature": string,"submitted_at"?: string,"work_date": string
                  }
                  Update: {
                    "company_id"?: string,"employee_id"?: string,"filled_at"?: string,"id"?: string,"job_id"?: string,"other_control"?: string | null,"other_hazard"?: string | null,"signature"?: string,"submitted_at"?: string,"work_date"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "flhas_company_id_employee_id_fkey"
      columns: ["company_id","employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "flhas_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "flhas_company_id_job_id_fkey"
      columns: ["company_id","job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"hazards": {
                  Row: {
                    "company_id": string,"created_at": string,"id": string,"is_active": boolean,"name": string,"sort_order": number,"updated_at": string
                  }
                  Insert: {
                    "company_id": string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "hazards_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"job_assignments": {
                  Row: {
                    "company_id": string,"created_at": string,"employee_id": string,"job_id": string
                  }
                  Insert: {
                    "company_id": string,"created_at"?: string,"employee_id": string,"job_id": string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"employee_id"?: string,"job_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_assignments_company_id_employee_id_fkey"
      columns: ["company_id","employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "job_assignments_company_id_job_id_fkey"
      columns: ["company_id","job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"job_equipment": {
                  Row: {
                    "company_id": string,"created_at": string,"equipment_id": string,"job_id": string
                  }
                  Insert: {
                    "company_id": string,"created_at"?: string,"equipment_id": string,"job_id": string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"equipment_id"?: string,"job_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_equipment_company_id_equipment_id_fkey"
      columns: ["company_id","equipment_id"]
isOneToOne: false
      referencedRelation: "equipment"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "job_equipment_company_id_job_id_fkey"
      columns: ["company_id","job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"jobs": {
                  Row: {
                    "address": string | null,"client": string | null,"company_id": string,"created_at": string,"end_date": string | null,"id": string,"job_number": string | null,"name": string,"start_date": string | null,"status": string,"updated_at": string
                  }
                  Insert: {
                    "address"?: string | null,"client"?: string | null,"company_id": string,"created_at"?: string,"end_date"?: string | null,"id"?: string,"job_number"?: string | null,"name": string,"start_date"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"client"?: string | null,"company_id"?: string,"created_at"?: string,"end_date"?: string | null,"id"?: string,"job_number"?: string | null,"name"?: string,"start_date"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "jobs_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"platform_owners": {
                  Row: {
                    "created_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ppe_items": {
                  Row: {
                    "company_id": string,"created_at": string,"id": string,"is_active": boolean,"name": string,"sort_order": number,"updated_at": string
                  }
                  Insert: {
                    "company_id": string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ppe_items_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"roles": {
                  Row: {
                    "created_at": string,"is_admin": boolean,"key": string,"name": string
                  }
                  Insert: {
                    "created_at"?: string,"is_admin"?: boolean,"key": string,"name": string
                  }
                  Update: {
                    "created_at"?: string,"is_admin"?: boolean,"key"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"safety_meeting_attendees": {
                  Row: {
                    "company_id": string,"employee_id": string,"meeting_id": string,"name": string,"position": number,"signature": string | null
                  }
                  Insert: {
                    "company_id": string,"employee_id": string,"meeting_id": string,"name": string,"position": number,"signature"?: string | null
                  }
                  Update: {
                    "company_id"?: string,"employee_id"?: string,"meeting_id"?: string,"name"?: string,"position"?: number,"signature"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "safety_meeting_attendees_company_id_employee_id_fkey"
      columns: ["company_id","employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "safety_meeting_attendees_company_id_meeting_id_fkey"
      columns: ["company_id","meeting_id"]
isOneToOne: false
      referencedRelation: "safety_meetings"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"safety_meeting_hazards": {
                  Row: {
                    "company_id": string,"hazard_id": string,"meeting_id": string,"name": string,"position": number
                  }
                  Insert: {
                    "company_id": string,"hazard_id": string,"meeting_id": string,"name": string,"position": number
                  }
                  Update: {
                    "company_id"?: string,"hazard_id"?: string,"meeting_id"?: string,"name"?: string,"position"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "safety_meeting_hazards_company_id_hazard_id_fkey"
      columns: ["company_id","hazard_id"]
isOneToOne: false
      referencedRelation: "hazards"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "safety_meeting_hazards_company_id_meeting_id_fkey"
      columns: ["company_id","meeting_id"]
isOneToOne: false
      referencedRelation: "safety_meetings"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"safety_meetings": {
                  Row: {
                    "company_id": string,"filled_at": string,"id": string,"job_id": string,"led_by": string,"other_hazard": string | null,"submitted_at": string,"topic": string,"work_date": string
                  }
                  Insert: {
                    "company_id": string,"filled_at": string,"id": string,"job_id": string,"led_by": string,"other_hazard"?: string | null,"submitted_at"?: string,"topic": string,"work_date": string
                  }
                  Update: {
                    "company_id"?: string,"filled_at"?: string,"id"?: string,"job_id"?: string,"led_by"?: string,"other_hazard"?: string | null,"submitted_at"?: string,"topic"?: string,"work_date"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "safety_meetings_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "safety_meetings_company_id_job_id_fkey"
      columns: ["company_id","job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "safety_meetings_company_id_led_by_fkey"
      columns: ["company_id","led_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"site_entries": {
                  Row: {
                    "company_id": string,"employee_id": string,"filled_at": string,"id": string,"job_id": string,"notes": string | null,"submitted_at": string,"work_date": string
                  }
                  Insert: {
                    "company_id": string,"employee_id": string,"filled_at": string,"id": string,"job_id": string,"notes"?: string | null,"submitted_at"?: string,"work_date": string
                  }
                  Update: {
                    "company_id"?: string,"employee_id"?: string,"filled_at"?: string,"id"?: string,"job_id"?: string,"notes"?: string | null,"submitted_at"?: string,"work_date"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "site_entries_company_id_employee_id_fkey"
      columns: ["company_id","employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "site_entries_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "site_entries_company_id_job_id_fkey"
      columns: ["company_id","job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"site_photos": {
                  Row: {
                    "caption": string | null,"code": string | null,"code_name": string | null,"company_id": string,"cost_code_id": string | null,"entry_id": string,"id": string,"path": string,"position": number
                  }
                  Insert: {
                    "caption"?: string | null,"code"?: string | null,"code_name"?: string | null,"company_id": string,"cost_code_id"?: string | null,"entry_id": string,"id": string,"path": string,"position": number
                  }
                  Update: {
                    "caption"?: string | null,"code"?: string | null,"code_name"?: string | null,"company_id"?: string,"cost_code_id"?: string | null,"entry_id"?: string,"id"?: string,"path"?: string,"position"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "site_photos_company_id_cost_code_id_fkey"
      columns: ["company_id","cost_code_id"]
isOneToOne: false
      referencedRelation: "cost_codes"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "site_photos_company_id_entry_id_fkey"
      columns: ["company_id","entry_id"]
isOneToOne: false
      referencedRelation: "site_entries"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"time_card_changes": {
                  Row: {
                    "changed_at": string,"changed_by": string,"company_id": string,"field": string,"id": number,"new_value": string | null,"old_value": string | null,"time_card_id": string
                  }
                  Insert: {
                    "changed_at"?: string,"changed_by": string,"company_id": string,"field": string,"id"?: never,"new_value"?: string | null,"old_value"?: string | null,"time_card_id": string
                  }
                  Update: {
                    "changed_at"?: string,"changed_by"?: string,"company_id"?: string,"field"?: string,"id"?: never,"new_value"?: string | null,"old_value"?: string | null,"time_card_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "time_card_changes_company_id_changed_by_fkey"
      columns: ["company_id","changed_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "time_card_changes_company_id_time_card_id_fkey"
      columns: ["company_id","time_card_id"]
isOneToOne: false
      referencedRelation: "time_cards"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"time_card_equipment": {
                  Row: {
                    "company_id": string,"equipment_id": string,"minutes": number,"name": string,"position": number,"time_card_id": string
                  }
                  Insert: {
                    "company_id": string,"equipment_id": string,"minutes": number,"name": string,"position": number,"time_card_id": string
                  }
                  Update: {
                    "company_id"?: string,"equipment_id"?: string,"minutes"?: number,"name"?: string,"position"?: number,"time_card_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "time_card_equipment_company_id_equipment_id_fkey"
      columns: ["company_id","equipment_id"]
isOneToOne: false
      referencedRelation: "equipment"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "time_card_equipment_company_id_time_card_id_fkey"
      columns: ["company_id","time_card_id"]
isOneToOne: false
      referencedRelation: "time_cards"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"time_card_lines": {
                  Row: {
                    "code": string,"company_id": string,"cost_code_id": string,"description": string,"minutes": number,"name": string,"position": number,"time_card_id": string
                  }
                  Insert: {
                    "code": string,"company_id": string,"cost_code_id": string,"description": string,"minutes": number,"name": string,"position": number,"time_card_id": string
                  }
                  Update: {
                    "code"?: string,"company_id"?: string,"cost_code_id"?: string,"description"?: string,"minutes"?: number,"name"?: string,"position"?: number,"time_card_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "time_card_lines_company_id_cost_code_id_fkey"
      columns: ["company_id","cost_code_id"]
isOneToOne: false
      referencedRelation: "cost_codes"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "time_card_lines_company_id_time_card_id_fkey"
      columns: ["company_id","time_card_id"]
isOneToOne: false
      referencedRelation: "time_cards"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"time_cards": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"break_minutes": number,"company_id": string,"employee_id": string,"end_time": string,"filled_at": string,"id": string,"job_id": string,"start_time": string,"status": string,"submitted_at": string,"updated_at": string,"work_date": string,"worked_minutes": number
                  }
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"break_minutes"?: number,"company_id": string,"employee_id": string,"end_time": string,"filled_at": string,"id": string,"job_id": string,"start_time": string,"status"?: string,"submitted_at"?: string,"updated_at"?: string,"work_date": string,"worked_minutes": number
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"break_minutes"?: number,"company_id"?: string,"employee_id"?: string,"end_time"?: string,"filled_at"?: string,"id"?: string,"job_id"?: string,"start_time"?: string,"status"?: string,"submitted_at"?: string,"updated_at"?: string,"work_date"?: string,"worked_minutes"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "time_cards_company_id_approved_by_fkey"
      columns: ["company_id","approved_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "time_cards_company_id_employee_id_fkey"
      columns: ["company_id","employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "time_cards_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "time_cards_company_id_job_id_fkey"
      columns: ["company_id","job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"trucking_slip_changes": {
                  Row: {
                    "changed_at": string,"changed_by": string,"company_id": string,"field": string,"id": number,"new_value": string | null,"old_value": string | null,"slip_id": string
                  }
                  Insert: {
                    "changed_at"?: string,"changed_by": string,"company_id": string,"field": string,"id"?: never,"new_value"?: string | null,"old_value"?: string | null,"slip_id": string
                  }
                  Update: {
                    "changed_at"?: string,"changed_by"?: string,"company_id"?: string,"field"?: string,"id"?: never,"new_value"?: string | null,"old_value"?: string | null,"slip_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "trucking_slip_changes_company_id_changed_by_fkey"
      columns: ["company_id","changed_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "trucking_slip_changes_company_id_slip_id_fkey"
      columns: ["company_id","slip_id"]
isOneToOne: false
      referencedRelation: "trucking_slips"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"trucking_slips": {
                  Row: {
                    "checked_at": string | null,"company_id": string,"employee_id": string,"filled_at": string,"id": string,"job_id": string,"loads": number | null,"material": string | null,"photo_path": string,"read_at": string | null,"read_status": string,"read_values": Json | null,"slip_date": string | null,"status": string,"submitted_at": string,"ticket_number": string | null,"tonnage": number | null,"truck_number": string | null,"trucking_company": string | null,"work_date": string
                  }
                  Insert: {
                    "checked_at"?: string | null,"company_id": string,"employee_id": string,"filled_at": string,"id": string,"job_id": string,"loads"?: number | null,"material"?: string | null,"photo_path": string,"read_at"?: string | null,"read_status"?: string,"read_values"?: Json | null,"slip_date"?: string | null,"status"?: string,"submitted_at"?: string,"ticket_number"?: string | null,"tonnage"?: number | null,"truck_number"?: string | null,"trucking_company"?: string | null,"work_date": string
                  }
                  Update: {
                    "checked_at"?: string | null,"company_id"?: string,"employee_id"?: string,"filled_at"?: string,"id"?: string,"job_id"?: string,"loads"?: number | null,"material"?: string | null,"photo_path"?: string,"read_at"?: string | null,"read_status"?: string,"read_values"?: Json | null,"slip_date"?: string | null,"status"?: string,"submitted_at"?: string,"ticket_number"?: string | null,"tonnage"?: number | null,"truck_number"?: string | null,"trucking_company"?: string | null,"work_date"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "trucking_slips_company_id_employee_id_fkey"
      columns: ["company_id","employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "trucking_slips_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "trucking_slips_company_id_job_id_fkey"
      columns: ["company_id","job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["company_id","id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "approve_time_card":
{ Args: { "p_id": string }; Returns: undefined
                           },
"check_trucking_slip":
{ Args: { "p_id": string,"p_loads": number,"p_material": string,"p_slip_date": string,"p_ticket_number": string,"p_tonnage": number,"p_truck_number": string,"p_trucking_company": string }; Returns: undefined
                           },
"daily_report_content":
{ Args: { "p_date": string,"p_job_id": string }; Returns: Json
                           },
"daily_report_days":
{ Args: { "p_days"?: number }; Returns: {
              "finalized_at": string,"has_pdf": boolean,"job_id": string,"job_name": string,"job_number": string,"report_id": string,"work_date": string
            }[]
                           },
"finalize_daily_report":
{ Args: { "p_date": string,"p_job_id": string }; Returns: string
                           },
"hook_before_user_created":
{ Args: { "event": Json }; Returns: Json
                           },
"my_job_crews":
{ Args: Record<PropertyKey, never>; Returns: {
              "employee_id": string,"full_name": string,"job_id": string
            }[]
                           },
"save_trucking_slip_reading":
{ Args: { "p_id": string,"p_values": Json }; Returns: undefined
                           },
"set_daily_report_pdf":
{ Args: { "p_id": string }; Returns: undefined
                           },
"set_job_crew":
{ Args: { "p_employee_ids": (string)[],"p_job_id": string }; Returns: undefined
                           },
"set_job_equipment":
{ Args: { "p_equipment_ids": (string)[],"p_job_id": string }; Returns: undefined
                           },
"submit_flha":
{ Args: { "p_cost_code_ids": (string)[],"p_filled_at"?: string,"p_hazards": Json,"p_id": string,"p_job_id": string,"p_other_control": string,"p_other_hazard": string,"p_ppe_ids": (string)[],"p_signature": string }; Returns: string
                           },
"submit_safety_meeting":
{ Args: { "p_attendees": Json,"p_filled_at"?: string,"p_hazard_ids": (string)[],"p_id": string,"p_job_id": string,"p_other_hazard": string,"p_topic": string }; Returns: string
                           },
"submit_site_entry":
{ Args: { "p_filled_at"?: string,"p_id": string,"p_job_id": string,"p_notes": string,"p_photos": Json }; Returns: string
                           },
"submit_time_card":
{ Args: { "p_break": number,"p_end": string,"p_equipment": Json,"p_filled_at"?: string,"p_id": string,"p_job_id": string,"p_lines": Json,"p_start": string,"p_work_date": string }; Returns: string
                           },
"submit_trucking_slip":
{ Args: { "p_filled_at"?: string,"p_id": string,"p_job_id": string }; Returns: string
                           },
"update_time_card":
{ Args: { "p_break": number,"p_end": string,"p_equipment": Json,"p_id": string,"p_lines": Json,"p_start": string }; Returns: undefined
                           },
"update_trucking_slip":
{ Args: { "p_id": string,"p_loads": number,"p_material": string,"p_slip_date": string,"p_ticket_number": string,"p_tonnage": number,"p_truck_number": string,"p_trucking_company": string }; Returns: undefined
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
