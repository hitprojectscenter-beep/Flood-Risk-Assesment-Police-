/**
 * TSRS i18n (Internationalization) Module
 * Supports: Hebrew (he), English (en), Russian (ru), French (fr), Spanish (es)
 */
const I18n = (() => {
    let currentLang = 'he';

    const TRANSLATIONS = {
        he: {
            // Header
            app_title: 'TSRS — מערכת הערכת סיכון צונאמי',
            app_subtitle: 'Tsunami Station Risk Score — משטרת ישראל',
            // Sidebar sections
            select_district: 'בחירת נפה',
            wave_height: 'גובה גל',
            map_layers: 'שכבות מפה',
            legend_tsrs: 'מקרא TSRS',
            station_details: 'פרטי תחנה',
            // Districts
            all_country: 'כל הארץ',
            north: 'צפון', haifa: 'חיפה', center: 'מרכז',
            tel_aviv: 'תל-אביב', jerusalem: 'ירושלים', south: 'דרום',
            // Layers
            layer_cities: 'ערים',
            layer_inundation: 'אזור הצפה',
            layer_police: 'תחנות משטרה',
            layer_roads: 'כבישים',
            layer_buildings: 'מבנים',
            layer_hillshade: 'תבליט',
            zoom_required: 'זום {n}+ נדרש',
            // Severity
            sev_low: 'נמוך', sev_medium: 'בינוני', sev_high: 'חזק', sev_extreme: 'קיצוני',
            // Legend
            critical: 'קריטי', high: 'גבוה', medium: 'בינוני', low: 'נמוך', minimal: 'מינימלי',
            heatmap_flood: 'מפת חום — הצפה',
            severe: 'חמור', light: 'קל',
            buildings_by_flood: 'מבנים (לפי עומק הצפה)',
            below_flood: 'מתחת לעומק הצפה',
            above_flood: 'מעל עומק הצפה',
            potential_shelter: 'מקלט פוטנציאלי (4+ קומות)',
            // TSRS components
            tsrs_score: 'ציון TSRS',
            risk_level: 'דרגת סיכון',
            district_label: 'נפה',
            comp_h: 'סיכון הצפה', comp_h_desc: 'חשיפה לגלי צונאמי',
            comp_v: 'פגיעות', comp_v_desc: 'פגיעות דמוגרפית',
            comp_o: 'צוואר בקבוק', comp_o_desc: 'קושי בפינוי',
            comp_r: 'תגובה', comp_r_desc: 'משאבי תגובה',
            comp_i: 'תשתיות', comp_i_desc: 'מבנים ומקלטים',
            // Verbal scores
            v_critical: 'קריטי', v_needs_improvement: 'דורש שיפור',
            v_sufficient: 'מספק', v_good: 'טוב', v_excellent: 'מצוין',
            // Overall verbal
            ov_critical: 'מצב קריטי — נדרשת תגובה מיידית',
            ov_high: 'סיכון גבוה — נדרש שיפור משמעותי',
            ov_medium: 'סיכון בינוני — מצב מספק, נדרש ניטור',
            ov_low: 'סיכון נמוך — מוכנות טובה',
            ov_minimal: 'סיכון מינימלי — מוכנות מצוינת',
            // Popup
            population: 'אוכלוסייה',
            shelters: 'מקלטים',
            routes: 'צירים',
            op_guidelines: 'הנחיות מבצעיות',
            demographic_profile: 'פילוח דמוגרפי',
            // Demographic
            demo_title: 'פילוח דמוגרפי-גאוגרפי',
            age_distribution: 'התפלגות גילאים',
            socio_cluster: 'אשכול סוציו-אקונומי',
            avg_income: 'הכנסה ממוצעת',
            car_ownership: 'בעלות רכב',
            cluster_high: 'גבוה', cluster_medium: 'בינוני', cluster_low: 'נמוך',
            // Operational
            op_title: 'הנחיות מבצעיות',
            backup_units: 'ניידות גיבוי',
            priority_level: 'עדיפות',
            evacuation_mode: 'מצב פינוי',
            critical_facilities: 'מוסדות קריטיים',
            vertical_shelters: 'מקלטים אנכיים',
            residents_at_risk: 'תושבים בסיכון',
            severity: 'חומרה',
            guidelines: 'הנחיות',
            evac_mandatory: 'חובה', evac_recommended: 'מומלץ', evac_advisory: 'המלצה',
        },
        en: {
            app_title: 'TSRS — Tsunami Risk Assessment System',
            app_subtitle: 'Tsunami Station Risk Score — Israel Police',
            select_district: 'Select District',
            wave_height: 'Wave Height',
            map_layers: 'Map Layers',
            legend_tsrs: 'TSRS Legend',
            station_details: 'Station Details',
            all_country: 'All Country',
            north: 'North', haifa: 'Haifa', center: 'Center',
            tel_aviv: 'Tel Aviv', jerusalem: 'Jerusalem', south: 'South',
            layer_cities: 'Cities',
            layer_inundation: 'Flood Zone',
            layer_police: 'Police Stations',
            layer_roads: 'Roads',
            layer_buildings: 'Buildings',
            layer_hillshade: 'Hillshade',
            zoom_required: 'Zoom {n}+ required',
            sev_low: 'Low', sev_medium: 'Moderate', sev_high: 'Strong', sev_extreme: 'Extreme',
            critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', minimal: 'Minimal',
            heatmap_flood: 'Heatmap — Flooding',
            severe: 'Severe', light: 'Light',
            buildings_by_flood: 'Buildings (by flood depth)',
            below_flood: 'Below flood depth',
            above_flood: 'Above flood depth',
            potential_shelter: 'Potential shelter (4+ floors)',
            tsrs_score: 'TSRS Score',
            risk_level: 'Risk Level',
            district_label: 'District',
            comp_h: 'Flood Hazard', comp_h_desc: 'Tsunami wave exposure',
            comp_v: 'Vulnerability', comp_v_desc: 'Demographic vulnerability',
            comp_o: 'Bottleneck', comp_o_desc: 'Evacuation difficulty',
            comp_r: 'Response', comp_r_desc: 'Response resources',
            comp_i: 'Infrastructure', comp_i_desc: 'Buildings & shelters',
            v_critical: 'Critical', v_needs_improvement: 'Needs improvement',
            v_sufficient: 'Sufficient', v_good: 'Good', v_excellent: 'Excellent',
            ov_critical: 'Critical — Immediate response required',
            ov_high: 'High risk — Significant improvement needed',
            ov_medium: 'Moderate risk — Satisfactory, monitoring needed',
            ov_low: 'Low risk — Good readiness',
            ov_minimal: 'Minimal risk — Excellent readiness',
            population: 'Population',
            shelters: 'Shelters',
            routes: 'Routes',
            op_guidelines: 'Operational Guidelines',
            demographic_profile: 'Demographic Profile',
            demo_title: 'Demographic-Geographic Profile',
            age_distribution: 'Age Distribution',
            socio_cluster: 'Socioeconomic Cluster',
            avg_income: 'Average Income',
            car_ownership: 'Car Ownership',
            cluster_high: 'High', cluster_medium: 'Medium', cluster_low: 'Low',
            op_title: 'Operational Guidelines',
            backup_units: 'Backup Units',
            priority_level: 'Priority',
            evacuation_mode: 'Evacuation Mode',
            critical_facilities: 'Critical Facilities',
            vertical_shelters: 'Vertical Shelters',
            residents_at_risk: 'Residents at Risk',
            severity: 'Severity',
            guidelines: 'Guidelines',
            evac_mandatory: 'Mandatory', evac_recommended: 'Recommended', evac_advisory: 'Advisory',
        },
        ru: {
            app_title: 'TSRS — Система оценки риска цунами',
            app_subtitle: 'Tsunami Station Risk Score — Полиция Израиля',
            select_district: 'Выберите округ',
            wave_height: 'Высота волны',
            map_layers: 'Слои карты',
            legend_tsrs: 'Легенда TSRS',
            station_details: 'Детали станции',
            all_country: 'Вся страна',
            north: 'Север', haifa: 'Хайфа', center: 'Центр',
            tel_aviv: 'Тель-Авив', jerusalem: 'Иерусалим', south: 'Юг',
            layer_cities: 'Города',
            layer_inundation: 'Зона затопления',
            layer_police: 'Полицейские участки',
            layer_roads: 'Дороги',
            layer_buildings: 'Здания',
            layer_hillshade: 'Рельеф',
            zoom_required: 'Зум {n}+ необходим',
            sev_low: 'Низкий', sev_medium: 'Средний', sev_high: 'Сильный', sev_extreme: 'Экстремальный',
            critical: 'Критический', high: 'Высокий', medium: 'Средний', low: 'Низкий', minimal: 'Минимальный',
            heatmap_flood: 'Тепловая карта — затопление',
            severe: 'Тяжёлый', light: 'Лёгкий',
            buildings_by_flood: 'Здания (по глубине затопления)',
            below_flood: 'Ниже уровня затопления',
            above_flood: 'Выше уровня затопления',
            potential_shelter: 'Потенциальное убежище (4+ этажей)',
            tsrs_score: 'Балл TSRS',
            risk_level: 'Уровень риска',
            district_label: 'Округ',
            comp_h: 'Опасность', comp_h_desc: 'Воздействие цунами',
            comp_v: 'Уязвимость', comp_v_desc: 'Демографическая уязвимость',
            comp_o: 'Узкое место', comp_o_desc: 'Сложность эвакуации',
            comp_r: 'Реагирование', comp_r_desc: 'Ресурсы реагирования',
            comp_i: 'Инфраструктура', comp_i_desc: 'Здания и укрытия',
            v_critical: 'Критический', v_needs_improvement: 'Требует улучшения',
            v_sufficient: 'Достаточный', v_good: 'Хороший', v_excellent: 'Отличный',
            ov_critical: 'Критическое состояние — требуется немедленная реакция',
            ov_high: 'Высокий риск — требуется значительное улучшение',
            ov_medium: 'Средний риск — удовлетворительно, требуется мониторинг',
            ov_low: 'Низкий риск — хорошая готовность',
            ov_minimal: 'Минимальный риск — отличная готовность',
            population: 'Население', shelters: 'Укрытия', routes: 'Маршруты',
            op_guidelines: 'Оперативные указания',
            demographic_profile: 'Демографический профиль',
            demo_title: 'Демографический профиль',
            age_distribution: 'Возрастное распределение',
            socio_cluster: 'Социально-экономический кластер',
            avg_income: 'Средний доход', car_ownership: 'Владение авто',
            cluster_high: 'Высокий', cluster_medium: 'Средний', cluster_low: 'Низкий',
            op_title: 'Оперативные указания',
            backup_units: 'Подкрепление', priority_level: 'Приоритет',
            evacuation_mode: 'Режим эвакуации',
            critical_facilities: 'Критические объекты',
            vertical_shelters: 'Вертикальные укрытия',
            residents_at_risk: 'Жители в зоне риска',
            severity: 'Тяжесть', guidelines: 'Указания',
            evac_mandatory: 'Обязательная', evac_recommended: 'Рекомендуемая', evac_advisory: 'Рекомендация',
        },
        fr: {
            app_title: 'TSRS — Système d\'évaluation des risques de tsunami',
            app_subtitle: 'Tsunami Station Risk Score — Police d\'Israël',
            select_district: 'Choisir le district',
            wave_height: 'Hauteur de vague',
            map_layers: 'Couches de carte',
            legend_tsrs: 'Légende TSRS',
            station_details: 'Détails de la station',
            all_country: 'Tout le pays',
            north: 'Nord', haifa: 'Haïfa', center: 'Centre',
            tel_aviv: 'Tel-Aviv', jerusalem: 'Jérusalem', south: 'Sud',
            layer_cities: 'Villes',
            layer_inundation: 'Zone d\'inondation',
            layer_police: 'Postes de police',
            layer_roads: 'Routes',
            layer_buildings: 'Bâtiments',
            layer_hillshade: 'Relief',
            zoom_required: 'Zoom {n}+ requis',
            sev_low: 'Faible', sev_medium: 'Modéré', sev_high: 'Fort', sev_extreme: 'Extrême',
            critical: 'Critique', high: 'Élevé', medium: 'Moyen', low: 'Faible', minimal: 'Minimal',
            heatmap_flood: 'Carte thermique — inondation',
            severe: 'Grave', light: 'Léger',
            buildings_by_flood: 'Bâtiments (par profondeur d\'inondation)',
            below_flood: 'Sous le niveau d\'inondation',
            above_flood: 'Au-dessus du niveau d\'inondation',
            potential_shelter: 'Abri potentiel (4+ étages)',
            tsrs_score: 'Score TSRS',
            risk_level: 'Niveau de risque',
            district_label: 'District',
            comp_h: 'Danger', comp_h_desc: 'Exposition au tsunami',
            comp_v: 'Vulnérabilité', comp_v_desc: 'Vulnérabilité démographique',
            comp_o: 'Goulot', comp_o_desc: 'Difficulté d\'évacuation',
            comp_r: 'Réponse', comp_r_desc: 'Ressources de réponse',
            comp_i: 'Infrastructure', comp_i_desc: 'Bâtiments et abris',
            v_critical: 'Critique', v_needs_improvement: 'À améliorer',
            v_sufficient: 'Suffisant', v_good: 'Bon', v_excellent: 'Excellent',
            ov_critical: 'État critique — réponse immédiate requise',
            ov_high: 'Risque élevé — amélioration significative nécessaire',
            ov_medium: 'Risque modéré — satisfaisant, surveillance requise',
            ov_low: 'Risque faible — bonne préparation',
            ov_minimal: 'Risque minimal — excellente préparation',
            population: 'Population', shelters: 'Abris', routes: 'Itinéraires',
            op_guidelines: 'Directives opérationnelles',
            demographic_profile: 'Profil démographique',
            demo_title: 'Profil démographique',
            age_distribution: 'Répartition par âge',
            socio_cluster: 'Cluster socio-économique',
            avg_income: 'Revenu moyen', car_ownership: 'Possession de voiture',
            cluster_high: 'Élevé', cluster_medium: 'Moyen', cluster_low: 'Faible',
            op_title: 'Directives opérationnelles',
            backup_units: 'Unités de renfort', priority_level: 'Priorité',
            evacuation_mode: 'Mode d\'évacuation',
            critical_facilities: 'Installations critiques',
            vertical_shelters: 'Abris verticaux',
            residents_at_risk: 'Résidents à risque',
            severity: 'Gravité', guidelines: 'Directives',
            evac_mandatory: 'Obligatoire', evac_recommended: 'Recommandée', evac_advisory: 'Conseil',
        },
        es: {
            app_title: 'TSRS — Sistema de evaluación de riesgo de tsunami',
            app_subtitle: 'Tsunami Station Risk Score — Policía de Israel',
            select_district: 'Seleccionar distrito',
            wave_height: 'Altura de ola',
            map_layers: 'Capas del mapa',
            legend_tsrs: 'Leyenda TSRS',
            station_details: 'Detalles de estación',
            all_country: 'Todo el país',
            north: 'Norte', haifa: 'Haifa', center: 'Centro',
            tel_aviv: 'Tel Aviv', jerusalem: 'Jerusalén', south: 'Sur',
            layer_cities: 'Ciudades',
            layer_inundation: 'Zona de inundación',
            layer_police: 'Estaciones de policía',
            layer_roads: 'Carreteras',
            layer_buildings: 'Edificios',
            layer_hillshade: 'Relieve',
            zoom_required: 'Zoom {n}+ requerido',
            sev_low: 'Bajo', sev_medium: 'Moderado', sev_high: 'Fuerte', sev_extreme: 'Extremo',
            critical: 'Crítico', high: 'Alto', medium: 'Medio', low: 'Bajo', minimal: 'Mínimo',
            heatmap_flood: 'Mapa de calor — inundación',
            severe: 'Grave', light: 'Leve',
            buildings_by_flood: 'Edificios (por profundidad de inundación)',
            below_flood: 'Bajo nivel de inundación',
            above_flood: 'Sobre nivel de inundación',
            potential_shelter: 'Refugio potencial (4+ pisos)',
            tsrs_score: 'Puntuación TSRS',
            risk_level: 'Nivel de riesgo',
            district_label: 'Distrito',
            comp_h: 'Peligro', comp_h_desc: 'Exposición al tsunami',
            comp_v: 'Vulnerabilidad', comp_v_desc: 'Vulnerabilidad demográfica',
            comp_o: 'Cuello de botella', comp_o_desc: 'Dificultad de evacuación',
            comp_r: 'Respuesta', comp_r_desc: 'Recursos de respuesta',
            comp_i: 'Infraestructura', comp_i_desc: 'Edificios y refugios',
            v_critical: 'Crítico', v_needs_improvement: 'Necesita mejora',
            v_sufficient: 'Suficiente', v_good: 'Bueno', v_excellent: 'Excelente',
            ov_critical: 'Estado crítico — se requiere respuesta inmediata',
            ov_high: 'Riesgo alto — se necesita mejora significativa',
            ov_medium: 'Riesgo moderado — satisfactorio, se necesita monitoreo',
            ov_low: 'Riesgo bajo — buena preparación',
            ov_minimal: 'Riesgo mínimo — excelente preparación',
            population: 'Población', shelters: 'Refugios', routes: 'Rutas',
            op_guidelines: 'Directrices operativas',
            demographic_profile: 'Perfil demográfico',
            demo_title: 'Perfil demográfico',
            age_distribution: 'Distribución por edad',
            socio_cluster: 'Clúster socioeconómico',
            avg_income: 'Ingreso promedio', car_ownership: 'Posesión de auto',
            cluster_high: 'Alto', cluster_medium: 'Medio', cluster_low: 'Bajo',
            op_title: 'Directrices operativas',
            backup_units: 'Unidades de respaldo', priority_level: 'Prioridad',
            evacuation_mode: 'Modo de evacuación',
            critical_facilities: 'Instalaciones críticas',
            vertical_shelters: 'Refugios verticales',
            residents_at_risk: 'Residentes en riesgo',
            severity: 'Gravedad', guidelines: 'Directrices',
            evac_mandatory: 'Obligatoria', evac_recommended: 'Recomendada', evac_advisory: 'Aviso',
        },
    };

    function t(key, params) {
        const str = (TRANSLATIONS[currentLang] && TRANSLATIONS[currentLang][key]) ||
                    (TRANSLATIONS['en'] && TRANSLATIONS['en'][key]) || key;
        if (params) {
            return str.replace(/\{(\w+)\}/g, (_, k) => params[k] !== undefined ? params[k] : `{${k}}`);
        }
        return str;
    }

    function setLanguage(lang) {
        if (!TRANSLATIONS[lang]) return;
        currentLang = lang;
        const isRtl = lang === 'he';
        document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
        document.documentElement.lang = lang;
        document.body.style.direction = isRtl ? 'rtl' : 'ltr';
        _updateStaticUI();
        // Store preference
        try { localStorage.setItem('tsrs_lang', lang); } catch(e) {}
    }

    function getLang() { return currentLang; }
    function isRTL() { return currentLang === 'he'; }

    function _updateStaticUI() {
        // Header
        _setText('app-title', t('app_title'));
        _setText('app-subtitle', t('app_subtitle'));
        // Sidebar sections
        _setText('section-district', '🏛️ ' + t('select_district'));
        _setText('section-wave', '🌊 ' + t('wave_height'));
        _setText('section-layers', '🗺️ ' + t('map_layers'));
        _setText('section-legend', '📊 ' + t('legend_tsrs'));
        // Layer labels
        _setText('label-text-stations', '🏙️ ' + t('layer_cities'));
        _setText('label-text-inundation', '🌊 ' + t('layer_inundation'));
        _setText('label-text-police', '🛡️ ' + t('layer_police'));
        _setText('label-text-roads', '🛣️ ' + t('layer_roads'));
        _setText('label-text-buildings', '🏗️ ' + t('layer_buildings'));
        _setText('label-text-hillshade', '⛰️ ' + t('layer_hillshade'));
        // Legend
        _setText('legend-critical', t('critical') + ' (80-100)');
        _setText('legend-high', t('high') + ' (60-80)');
        _setText('legend-medium', t('medium') + ' (40-60)');
        _setText('legend-low', t('low') + ' (20-40)');
        _setText('legend-minimal', t('minimal') + ' (0-20)');
        _setText('legend-heatmap-title', t('heatmap_flood'));
        _setText('legend-severe', t('severe'));
        _setText('legend-medium-flood', t('medium'));
        _setText('legend-light', t('light'));
        _setText('legend-buildings-title', t('buildings_by_flood'));
        _setText('legend-below', t('below_flood'));
        _setText('legend-above', t('above_flood'));
        _setText('legend-shelter', t('potential_shelter'));
        // District selector
        const select = document.getElementById('district-select');
        if (select) {
            select.options[0].text = t('all_country');
            select.options[1].text = t('north');
            select.options[2].text = t('haifa');
            select.options[3].text = t('center');
            select.options[4].text = t('tel_aviv');
            if (select.options[5]) select.options[5].text = t('south');
        }
        // Language selector highlight
        document.querySelectorAll('.lang-btn').forEach(btn => {
            btn.classList.toggle('lang-active', btn.dataset.lang === currentLang);
        });
    }

    function _setText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    // Init: check localStorage for saved preference
    function init() {
        try {
            const saved = localStorage.getItem('tsrs_lang');
            if (saved && TRANSLATIONS[saved]) currentLang = saved;
        } catch(e) {}
        if (currentLang !== 'he') setLanguage(currentLang);
    }

    return { t, setLanguage, getLang, isRTL, init };
})();
