import os
from supabase import create_client, Client
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
load_dotenv(env_path)

URL = os.getenv("SUPABASE_URL")
KEY = os.getenv("SUPABASE_SERVICE_KEY")

def test_connection():
    print("=" * 60)
    print(" VERIFICACIÓN DE CONEXIÓN CON SUPABASE")
    print("=" * 60)
    print(f" Project URL configurada: {URL}")
    
    if not URL or not KEY:
        print(" [ERROR] SUPABASE_URL o SUPABASE_SERVICE_KEY no encontrados en .env")
        return False
        
    try:
        supabase: Client = create_client(URL, KEY)
        
        # Verificar tablas del esquema real COMEX en español
        tablas_a_verificar = [
            "operaciones",
            "responsables",
            "etapas_catalogo",
            "clientes",
            "historial_etapas",
            "pedidos_sap",
            "facturas"
        ]
        
        tablas_existentes = []
        tablas_faltantes = []
        
        for tabla in tablas_a_verificar:
            try:
                res = supabase.table(tabla).select("count", count="exact").limit(1).execute()
                tablas_existentes.append((tabla, res.count if res.count is not None else 0))
            except Exception as e:
                tablas_faltantes.append(tabla)
        
        if tablas_faltantes:
            print("\n [ESTADO: ESQUEMA INCOMPLETO O NO APLICADO]")
            print(f" Tablas encontradas: {len(tablas_existentes)}/{len(tablas_a_verificar)}")
            for t, cnt in tablas_existentes:
                print(f"   [OK] {t}: {cnt} registros")
            print(f" Tablas faltantes: {', '.join(tablas_faltantes)}")
            print("\n Acción requerida: Ejecuta el script 'schema.sql' en el SQL Editor de tu proyecto Supabase.")
            return False
        else:
            print("\n [ESTADO: CONEXIÓN Y ESQUEMA EXITOSOS]")
            for t, cnt in tablas_existentes:
                print(f"   [OK] {t}: {cnt} registros")
            return True
            
    except Exception as e:
        print(f"\n [ERROR] Falló la conexión: {e}")
        return False

if __name__ == "__main__":
    test_connection()
