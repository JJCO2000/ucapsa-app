import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { manualPreregistrationLinkEnabled } from '../../constants/preregistrationFeature';
import { useSession } from '../../hooks/useSession';
import { getAdminManualLinkRequests, reviewAdminManualLink,
  type AdminManualLinkRequest } from '../../services/preregistration-manual-link.service';

export default function AdminPreregistrationLinkRequestsScreen() {
  const { isAdmin } = useSession();
  const [rows,setRows] = useState<AdminManualLinkRequest[]>([]);
  const [notes,setNotes] = useState<Record<string,string>>({});
  const [proof,setProof] = useState<Record<string,boolean>>({});
  const [busy,setBusy] = useState<string | null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try { setRows(await getAdminManualLinkRequests()); }
    catch(e) { setError(e instanceof Error ? e.message : 'No se pudieron obtener solicitudes.'); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => {
    if (!isAdmin || !manualPreregistrationLinkEnabled) return;
    setLoading(true);
    void load();
  },[isAdmin,load]));

  async function decide(row: AdminManualLinkRequest,approve: boolean) {
    if (busy) return;
    const note=(notes[row.requestId] ?? '').trim();
    if (note.length < 15 || (approve && !proof[row.requestId])) {
      Alert.alert('Verificación administrativa',
        'Escribe cómo comprobaste la identidad (15 caracteres mínimo). Para aprobar debes marcar la confirmación presencial.');
      return;
    }
    setBusy(row.requestId);
    try {
      await reviewAdminManualLink(row.requestId,approve,note);
      Alert.alert(approve ? 'Identidad aprobada' : 'Solicitud rechazada',
        approve ? 'El titular podrá completar la vinculación al abrir su cuenta.'
          : 'El expediente no fue transferido.');
      await load();
    } catch (e) {
      Alert.alert('No se pudo resolver',e instanceof Error ? e.message : 'Intenta nuevamente.');
    } finally { setBusy(null); }
  }

  if (!isAdmin || !manualPreregistrationLinkEnabled) return <Redirect href="/home" />;
  return <KeyboardAwareScreen style={styles.screen}>
    <Pressable accessibilityRole="button" style={styles.back} onPress={() => router.back()}>
      <MaterialIcons name="arrow-back" size={20} color={ucapsaBrand.colors.redDark} />
      <Text style={styles.backText}>Preinscripciones</Text>
    </Pressable>
    <Text style={styles.title}>Vinculaciones pendientes</Text>
    <Text style={styles.subtitle}>
      Sin SMS. Una coincidencia de celular o correo no prueba identidad.
      Confirma personalmente que el solicitante es el tutor antes de aprobar.
    </Text>
    {loading ? <ActivityIndicator color={ucapsaBrand.colors.redDark}/> : null}
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {!loading && !error && rows.length===0 ? (
      <Text style={styles.subtitle}>No hay solicitudes pendientes.</Text>
    ) : null}
    {rows.map(row => (
      <View key={row.requestId} style={styles.card}>
        <Text style={styles.name}>{row.accountName || 'Cuenta sin nombre'}</Text>
        <Text style={styles.info}>Cuenta: {row.accountEmail || 'Sin correo'} · {row.accountPhone || 'Sin teléfono'}</Text>
        <Text style={styles.info}>Solicitud con: {row.requestedPhone || row.requestedEmail || 'Sin contacto'}</Text>
        <Text style={styles.info}>Tutor en expediente: {row.ownerName || 'Sin coincidencia única'}</Text>
        <Text style={styles.info}>Perros: {row.dogNames || 'Pendiente de identificar'}</Text>
        <Text style={styles.note}>Verifica la identidad fuera de la aplicación antes de vincular.</Text>
        <TextInput accessibilityLabel="Evidencia de comprobación de identidad"
          value={notes[row.requestId]??''}
          onChangeText={value=>setNotes(state=>({...state,[row.requestId]:value}))}
          placeholder="Ej. Identificación y confirmación presencial con el tutor"
          placeholderTextColor={ucapsaBrand.colors.muted} multiline
          style={styles.input}/>
        {row.ownerName ? (
          <Pressable accessibilityRole="checkbox"
            accessibilityState={{checked:Boolean(proof[row.requestId])}}
            onPress={()=>setProof(v=>({...v,[row.requestId]:!v[row.requestId]}))}
            style={styles.confirm}>
            <MaterialIcons name={proof[row.requestId] ? 'check-box' : 'check-box-outline-blank'}
              size={21} color={ucapsaBrand.colors.greenDark}/>
            <Text style={styles.info}>Confirmé que es el mismo tutor mediante una comprobación independiente</Text>
          </Pressable>
        ) : null}
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" disabled={Boolean(busy)||!row.ownerName||!proof[row.requestId]}
            style={[styles.approve,Boolean(busy)&&styles.disabled]}
            onPress={()=>void decide(row,true)}>
            <Text style={styles.actionText}>Aprobar vinculación</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={Boolean(busy)}
            style={styles.reject} onPress={()=>void decide(row,false)}>
            <Text style={styles.rejectText}>Rechazar</Text>
          </Pressable>
        </View>
      </View>
    ))}
  </KeyboardAwareScreen>;
}

const styles=StyleSheet.create({
  screen:{backgroundColor:ucapsaBrand.colors.background},
  back:{flexDirection:'row',alignItems:'center',gap:8,marginBottom:12},
  backText:{color:ucapsaBrand.colors.redDark,fontWeight:'800'},
  title:{fontSize:25,fontWeight:'900',color:ucapsaBrand.colors.text},
  subtitle:{fontSize:12,lineHeight:19,color:ucapsaBrand.colors.muted,marginVertical:10},
  card:{backgroundColor:ucapsaBrand.colors.surface,borderWidth:1,borderColor:ucapsaBrand.colors.border,
    borderRadius:14,padding:15,gap:9,marginVertical:8},
  name:{fontSize:17,fontWeight:'800',color:ucapsaBrand.colors.text},
  info:{fontSize:12,color:ucapsaBrand.colors.text,flexShrink:1},
  note:{fontSize:12,color:ucapsaBrand.colors.redDark,fontWeight:'700'},
  input:{minHeight:72,textAlignVertical:'top',borderRadius:10,borderWidth:1,
    borderColor:ucapsaBrand.colors.border,padding:10,color:ucapsaBrand.colors.text},
  confirm:{flexDirection:'row',gap:8,alignItems:'center',paddingVertical:4},
  actions:{gap:8,marginTop:5},
  approve:{backgroundColor:ucapsaBrand.colors.greenDark,borderRadius:10,alignItems:'center',padding:13},
  reject:{borderColor:ucapsaBrand.colors.redDark,borderWidth:1,borderRadius:10,padding:12,alignItems:'center'},
  actionText:{fontWeight:'800',color:ucapsaBrand.colors.surface},
  rejectText:{fontWeight:'800',color:ucapsaBrand.colors.redDark},
  disabled:{opacity:0.55},
  error:{color:ucapsaBrand.colors.danger},
});
