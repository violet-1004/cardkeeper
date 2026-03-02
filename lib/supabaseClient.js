import { createClient } from '@supabase/supabase-js'

// 請將下面這兩個字串替換成你 Supabase 專案的真實資訊
const supabaseUrl = 'https://qvmypjngydubsigeeial.supabase.co' 
const supabaseKey = 'sb_publishable_E6voZvrUYWaaZBzsxx8CXg_KsjKubRn' 

export const supabase = createClient(supabaseUrl, supabaseKey)