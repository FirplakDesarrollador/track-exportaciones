"""
Script para poblar datos de prueba realistas en Supabase para el sistema COMEX.
Genera operaciones históricas (cerradas) para métricas de Lead Time,
operaciones en curso en diferentes etapas, operaciones estancadas y pedidos SAP.
"""

import os
import random
from datetime import date, timedelta
from dotenv import load_dotenv
from supabase import create_client, Client

env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
load_dotenv(env_path)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

def seed_database():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Error: Credenciales de Supabase no encontradas en .env")
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    print("Verificando catálogos...")
    # Verificar catálogos
    resp_res = supabase.table("responsables").select("id, nombre").execute()
    responsables = {r["nombre"]: r["id"] for r in resp_res.data}
    if not responsables:
        print("Error: No se encontraron responsables. Asegúrate de haber ejecutado schema.sql en Supabase.")
        return

    client_res = supabase.table("clientes").select("id, nombre, pais_predeterminado").execute()
    clientes = client_res.data

    nav_res = supabase.table("navieras").select("id, nombre").execute()
    navieras = nav_res.data

    ag_res = supabase.table("agentes_carga").select("id, nombre").execute()
    agentes = ag_res.data

    etapas_res = supabase.table("etapas_catalogo").select("id, orden, nombre").order("orden").execute()
    etapas = etapas_res.data

    print(f"Catálogos listos: {len(responsables)} responsables, {len(clientes)} clientes, {len(navieras)} navieras, {len(agentes)} agentes, {len(etapas)} etapas.")

    # Verificar si ya existen operaciones
    ops_count = supabase.table("operaciones").select("id", count="exact").execute()
    if ops_count.count and ops_count.count > 0:
        print(f"Ya existen {ops_count.count} operaciones en la base de datos.")
        respuesta = input("¿Deseas insertar operaciones de prueba adicionales? (s/n): ")
        if respuesta.lower() != 's':
            print("Operación cancelada.")
            return

    hoy = date.today()
    catalina_id = responsables.get("Catalina") or list(responsables.values())[0]
    laura_id = responsables.get("Laura") or list(responsables.values())[0]
    john_id = responsables.get("John") or list(responsables.values())[0]
    resp_list = [catalina_id, laura_id, john_id]

    incoterms = ["FOB", "CIF", "CFR", "FCA", "DAP"]
    modalidades = ["FCL", "LCL", "aéreo", "courier"]

    print("Generando operaciones de prueba...")

    # 1. Cinco operaciones históricas CERRADAS (recorrieron las 8 etapas) para métricas de Lead Time
    for i in range(1, 6):
        fp = f"EXP-2025-{i:03d}"
        cli = clientes[(i - 1) % len(clientes)]
        nav = navieras[(i - 1) % len(navieras)]
        ag = agentes[(i - 1) % len(agentes)]
        resp = resp_list[(i - 1) % len(resp_list)]
        incoterm = incoterms[i % len(incoterms)]
        modalidad = "FCL" if i % 2 == 0 else "LCL"
        
        # Fecha de modulación entre 90 y 50 días atrás
        f_mod = hoy - timedelta(days=70 + i * 5)
        
        op_data = {
            "fp": fp,
            "cliente_id": cli["id"],
            "pais_destino": cli["pais_predeterminado"] or "México",
            "incoterm": incoterm,
            "modalidad": modalidad,
            "contenedor": f"MSCU{random.randint(1000000, 9999999)}",
            "responsable_id": resp,
            "naviera_id": nav["id"],
            "agente_carga_id": ag["id"],
            "tiene_fp": True,
            "fecha_modulacion": str(f_mod),
            "estado": "activa"  # El trigger al llegar a etapa 8 lo pasa a 'cerrada'
        }
        
        res = supabase.table("operaciones").insert(op_data).execute()
        op_id = res.data[0]["id"]
        
        # Registrar las etapas 2 a 8 con fechas consecutivas realistas
        # Etapa 1 ya fue insertada por el trigger fn_inicializar_etapa_operacion con f_mod
        dias_acumulados = 0
        delays = [0, 3, 5, 8, 3, 2, 18, 5] # días entre etapas aprox
        
        for e_idx in range(1, 8): # etapas orden 2 a 8
            etapa_obj = etapas[e_idx]
            dias_acumulados += delays[e_idx]
            f_etapa = f_mod + timedelta(days=dias_acumulados)
            
            supabase.table("historial_etapas").insert({
                "operacion_id": op_id,
                "etapa_id": etapa_obj["id"],
                "fecha": str(f_etapa),
                "responsable_id": resp,
                "observaciones": f"Registro de {etapa_obj['nombre']} completado conforme a itinerario."
            }).execute()

        # Insertar 1 o 2 pedidos SAP asociados
        supabase.table("pedidos_sap").insert({
            "operacion_id": op_id,
            "numero_ov": f"SAP-45{random.randint(100000, 999999)}",
            "fecha_ingreso_sap": str(f_mod + timedelta(days=3)),
            "valor": round(random.uniform(15000, 65000), 2),
            "observaciones": f"Pedido SAP principal para {cli['nombre']}"
        }).execute()
        
        print(f" -> Creada operación histórica cerrada: {fp}")

    # 2. Operaciones ACTIVAS en diferentes etapas
    estados_activos = [
        ("EXP-2026-001", catalina_id, 3, 4, True, "FCL"),   # En etapa 3 (entregado a CEDI)
        ("EXP-2026-002", laura_id, 6, 2, True, "FCL"),      # En etapa 6 (embarque)
        ("EXP-2026-003", john_id, 2, 8, True, "aéreo"),    # En etapa 2 (estancada: 8 días sin movimiento)
        ("EXP-2026-004", catalina_id, 5, 1, True, "LCL"),   # En etapa 5 (ingreso a puerto)
        ("EXP-2026-005", laura_id, 1, 6, False, "courier"), # En etapa 1 (sin FP - cotización MAC, estancada)
    ]

    for fp, resp_id, max_etapa, dias_atras_ultima, tiene_fp, mod in estados_activos:
        cli = clientes[random.randint(0, len(clientes)-1)]
        nav = navieras[random.randint(0, len(navieras)-1)]
        ag = agentes[random.randint(0, len(agentes)-1)]
        
        f_mod = hoy - timedelta(days=dias_atras_ultima + (max_etapa * 4))
        
        op_data = {
            "fp": fp,
            "cliente_id": cli["id"],
            "pais_destino": cli["pais_predeterminado"] or "Chile",
            "incoterm": "CIF" if mod == "FCL" else "FOB",
            "modalidad": mod,
            "contenedor": f"CMAU{random.randint(1000000, 9999999)}" if mod == "FCL" else "GUIA-AIR-8821",
            "responsable_id": resp_id,
            "naviera_id": nav["id"] if mod in ["FCL", "LCL"] else None,
            "agente_carga_id": ag["id"],
            "tiene_fp": tiene_fp,
            "fecha_modulacion": str(f_mod),
            "estado": "activa"
        }
        
        res = supabase.table("operaciones").insert(op_data).execute()
        op_id = res.data[0]["id"]
        
        # Si no tiene FP, registrar la cotización
        if not tiene_fp:
            supabase.table("cotizaciones_sin_fp").insert({
                "operacion_id": op_id,
                "archivo_o_link": "https://sharepoint.empresa.com/comex/cotizaciones/COT-2026-005.pdf",
                "fecha_envio_mac": str(f_mod),
                "motivo": "urgencia",
                "observaciones": "Envío urgente de muestras técnicas solicitado por gerencia."
            }).execute()

        # Avanzar hasta max_etapa
        curr_date = f_mod
        for e_idx in range(1, max_etapa):
            etapa_obj = etapas[e_idx]
            curr_date += timedelta(days=3)
            if e_idx == max_etapa - 1:
                curr_date = hoy - timedelta(days=dias_atras_ultima)
            
            supabase.table("historial_etapas").insert({
                "operacion_id": op_id,
                "etapa_id": etapa_obj["id"],
                "fecha": str(curr_date),
                "responsable_id": resp_id,
                "observaciones": f"Avance normal hacia {etapa_obj['nombre']}."
            }).execute()

        # Agregar pedido SAP si tiene etapa >= 2
        if max_etapa >= 2:
            supabase.table("pedidos_sap").insert({
                "operacion_id": op_id,
                "numero_ov": f"SAP-50{random.randint(100000, 999999)}",
                "fecha_ingreso_sap": str(f_mod + timedelta(days=2)),
                "valor": round(random.uniform(22000, 85000), 2),
                "observaciones": "Pedido ingresado en SAP."
            }).execute()
            
        print(f" -> Creada operación activa en etapa {max_etapa}: {fp}")

    print("\n¡Datos de prueba insertados con éxito!")

if __name__ == "__main__":
    seed_database()
