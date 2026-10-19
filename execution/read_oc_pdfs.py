import os
import csv
from supabase import create_client
from dotenv import load_dotenv

# Cargar variables
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

FOLDER_PATH = r"C:\Users\catalina.white\OneDrive - FIRPLAK SA\OC_importaciones"


def process_pdfs():
    output_file = "output.csv"

    with open(output_file, mode="w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=["po", "supplier"])
        writer.writeheader()

        for filename in os.listdir(FOLDER_PATH):

            if filename.lower().endswith(".pdf"):

                print(f"Procesando: {filename}")

                # Extraer desde nombre del archivo
                name = filename.replace(".pdf", "")
                parts = name.split(" ")

                po = parts[-1]
                supplier = " ".join(parts[:-1])

                # Guardar en CSV
                writer.writerow({
                    "po": po,
                    "supplier": supplier
                })

                # Guardar en Supabase
                data = {
                    "operation_type": "Import",
                    "fp_po_reference": po,
                    "supplier": supplier,
                    "current_status": "OC generated"
                }

                try:
                    supabase.table("operations").insert(data).execute()
                    print(f"Guardado en Supabase: {po}")
                except Exception as e:
                    print(f"Error Supabase: {e}")

                print(f"Guardado en CSV: {po} | {supplier}")


if __name__ == "__main__":
    process_pdfs()