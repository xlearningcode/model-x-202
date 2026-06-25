
-- Create storage bucket for generated images
INSERT INTO storage.buckets (id, name, public)
VALUES ('generated-images', 'generated-images', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for storage
CREATE POLICY "Allow authenticated uploads" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'generated-images');

CREATE POLICY "Allow authenticated select" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'generated-images');

CREATE POLICY "Allow authenticated delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'generated-images');
